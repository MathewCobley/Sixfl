import { randomUUID } from "crypto";
import { UserRole } from "@prisma/client";

import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import type { ResendWebhookEvent } from "@/lib/resend/verifyWebhook";

const ACTIONABLE_RESEND_EVENTS = new Set([
  "email.bounced",
  "email.failed",
  "email.suppressed",
  "email.complained",
  "email.delivery_delayed",
]);

const FALLBACK_ADMIN_ALERT_EMAIL = "mathewcobley1@gmail.com";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstEmail(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = asString(item);
      if (parsed) return parsed;
    }
    return null;
  }

  return asString(value);
}

function getNestedString(record: Record<string, unknown> | null, keys: string[]) {
  let current: unknown = record;

  for (const key of keys) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return null;
    current = currentRecord[key];
  }

  return asString(current);
}

function getReason(event: ResendWebhookEvent, eventType: string) {
  const data = asRecord(event.data);
  const candidates = [
    getNestedString(data, ["bounce", "message"]),
    getNestedString(data, ["bounce", "subType"]),
    getNestedString(data, ["bounce", "type"]),
    getNestedString(data, ["suppressed", "message"]),
    getNestedString(data, ["suppressed", "type"]),
    getNestedString(data, ["complaint", "type"]),
    asString(data?.reason),
    asString(data?.message),
    asString(data?.error),
    asString(event.reason),
    asString(event.message),
    asString(event.error),
  ];

  return candidates.find(Boolean) ?? eventType;
}

function statusLabel(eventType: string) {
  switch (eventType) {
    case "email.bounced":
      return "bounced";
    case "email.suppressed":
      return "suppressed";
    case "email.complained":
      return "marked as spam";
    case "email.delivery_delayed":
      return "delivery delayed";
    default:
      return "failed";
  }
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value && value.includes("@"))),
    ),
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function ensureAdminAlertTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "EmailDeliveryAdminAlertEvent" (
      "id" TEXT NOT NULL,
      "eventKey" TEXT NOT NULL,
      "deliveryId" TEXT,
      "eventType" TEXT NOT NULL,
      "providerMessageId" TEXT,
      "recipientEmail" TEXT,
      "subject" TEXT,
      "reason" TEXT,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "alertedAt" TIMESTAMP(3),
      "errorMessage" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "EmailDeliveryAdminAlertEvent_pkey" PRIMARY KEY ("id")
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "EmailDeliveryAdminAlertEvent_eventKey_key"
    ON "EmailDeliveryAdminAlertEvent"("eventKey")
  `);
}

async function claimEvent(input: {
  eventKey: string;
  deliveryId: string | null;
  eventType: string;
  providerMessageId: string | null;
  recipientEmail: string | null;
  subject: string | null;
  reason: string;
}) {
  const id = randomUUID();
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "EmailDeliveryAdminAlertEvent" (
      "id", "eventKey", "deliveryId", "eventType", "providerMessageId",
      "recipientEmail", "subject", "reason", "status", "createdAt", "updatedAt"
    ) VALUES (
      ${id}, ${input.eventKey}, ${input.deliveryId}, ${input.eventType},
      ${input.providerMessageId}, ${input.recipientEmail}, ${input.subject},
      ${input.reason}, 'PENDING', NOW(), NOW()
    )
    ON CONFLICT ("eventKey") DO NOTHING
    RETURNING "id"
  `;

  return rows[0]?.id ?? null;
}

async function getAdminAlertEmails() {
  const configured = (process.env.EMAIL_DELIVERY_ALERT_TO ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const admins = await prisma.user.findMany({
    where: {
      role: UserRole.ADMIN,
      email: { not: null },
    },
    select: { email: true },
  });

  return uniqueEmails([
    ...configured,
    ...admins.map((admin) => admin.email),
    FALLBACK_ADMIN_ALERT_EMAIL,
  ]);
}

export async function notifyAdminsOfResendDeliveryEvent(input: {
  event: ResendWebhookEvent;
  result: Record<string, unknown>;
  deliveryId: string | null;
}) {
  const eventType = asString(input.event.type)?.toLowerCase() ?? "unknown";
  const resultStatus = asString(input.result.status);

  if (
    !ACTIONABLE_RESEND_EVENTS.has(eventType) ||
    (resultStatus !== "failed" && resultStatus !== "delayed")
  ) {
    return { alerted: false, reason: "not_actionable" };
  }

  try {
    await ensureAdminAlertTable();

    const data = asRecord(input.event.data);
    const providerMessageId =
      asString(data?.email_id) ??
      asString(data?.emailId) ??
      asString(data?.id) ??
      null;
    const recipientEmail = firstEmail(data?.to);
    const originalSubject = asString(data?.subject);
    const reason = getReason(input.event, eventType);
    const createdAt = asString(input.event.created_at);
    const eventKey =
      input.deliveryId ??
      [providerMessageId, eventType, createdAt].filter(Boolean).join(":");

    if (!eventKey) {
      return { alerted: false, reason: "missing_event_key" };
    }

    const claimedId = await claimEvent({
      eventKey,
      deliveryId: input.deliveryId,
      eventType,
      providerMessageId,
      recipientEmail,
      subject: originalSubject,
      reason,
    });

    if (!claimedId) {
      return { alerted: false, reason: "duplicate_event" };
    }

    const recipients = await getAdminAlertEmails();
    if (recipients.length === 0) {
      await prisma.$executeRaw`
        UPDATE "EmailDeliveryAdminAlertEvent"
        SET "status" = 'FAILED',
            "errorMessage" = 'No admin alert email address is configured.',
            "updatedAt" = NOW()
        WHERE "id" = ${claimedId}
      `;
      return { alerted: false, reason: "no_admin_email" };
    }

    const label = statusLabel(eventType);
    const delayed = eventType === "email.delivery_delayed";
    const baseUrl = (
      process.env.NEXTAUTH_URL || "https://www.sixfl.co.uk"
    ).replace(/\/$/, "");
    const issueUrl = `${baseUrl}/admin/delivery-issues`;
    const safeEmail = escapeHtml(recipientEmail ?? "Unknown recipient");
    const safeSubject = escapeHtml(originalSubject ?? "No subject recorded");
    const safeReason = escapeHtml(reason);

    await sendEmail({
      to: recipients,
      subject: `[SIXFL] Email ${label}: ${recipientEmail ?? "unknown recipient"}`,
      text: [
        `SIXFL email ${label}.`,
        `Recipient: ${recipientEmail ?? "Unknown"}`,
        `Subject: ${originalSubject ?? "No subject recorded"}`,
        `Reason: ${reason}`,
        delayed
          ? "This is currently a temporary delay and may still deliver."
          : "Check and correct the recipient address before sending again.",
        `Review: ${issueUrl}`,
      ].join("\n\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#10231c;max-width:680px;margin:0 auto;padding:24px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${delayed ? "#9a6700" : "#b42318"};">SIXFL email delivery alert</p>
          <h1 style="margin:0 0 20px;font-size:24px;">Email ${escapeHtml(label)}</h1>
          <div style="border:1px solid ${delayed ? "#f4c95d" : "#f5a9a2"};background:${delayed ? "#fff8df" : "#fff1f0"};border-radius:14px;padding:18px;">
            <p style="margin:0 0 8px;"><strong>Recipient:</strong> ${safeEmail}</p>
            <p style="margin:0 0 8px;"><strong>Subject:</strong> ${safeSubject}</p>
            <p style="margin:0;"><strong>Reason:</strong> ${safeReason}</p>
          </div>
          <p style="margin:18px 0;">${
            delayed
              ? "This is a temporary warning and the message may still arrive. SIXFL will remove it from the delayed list if a later delivery event is received."
              : "Do not simply resend to the same address. Check for a typo or obtain a corrected address first."
          }</p>
          <p style="margin:22px 0 0;"><a href="${issueUrl}" style="display:inline-block;background:#10b981;color:#07130f;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Review delivery issues</a></p>
        </div>
      `,
    });

    await prisma.$executeRaw`
      UPDATE "EmailDeliveryAdminAlertEvent"
      SET "status" = 'SENT',
          "alertedAt" = NOW(),
          "errorMessage" = NULL,
          "updatedAt" = NOW()
      WHERE "id" = ${claimedId}
    `;

    return { alerted: true };
  } catch (error) {
    console.error("[resend] failed to notify admins of delivery issue", {
      deliveryId: input.deliveryId,
      eventType,
      error,
    });

    return {
      alerted: false,
      reason: error instanceof Error ? error.message : "admin_alert_failed",
    };
  }
}
