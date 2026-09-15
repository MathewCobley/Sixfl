// ========================================
// File: src/app/(admin)/admin/messages/referees/[id]/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  UserRole,
} from "@prisma/client";

import {
  linkQueuedEmailDispatchToThread,
  recordOutboundSms,
} from "@/lib/messaging/service";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getCentralRefereeCommsPath(
  refereeId: string,
  params?: Record<string, string | number | null | undefined>,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }

  const suffix = query.toString();
  return `/admin/messages/referees/${refereeId}${suffix ? `?${suffix}` : ""}`;
}

async function getRefereeContact(refereeId: string) {
  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdFromLeadId: true,
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    return null;
  }

  const [profileRows, sourceLead] = await Promise.all([
    prisma.$queryRaw<Array<{ phone: string | null; standardNightFeePence: number }>>`
      SELECT "phone", "standardNightFeePence"
      FROM "RefereeProfile"
      WHERE "userId" = ${referee.id}
      LIMIT 1
    `.catch(() => []),
    referee.createdFromLeadId
      ? prisma.interestLead.findUnique({
          where: { id: referee.createdFromLeadId },
          select: { phone: true },
        })
      : null,
  ]);

  const phone = profileRows[0]?.phone || sourceLead?.phone || null;

  return {
    referee,
    phone,
    standardNightFeePence: profileRows[0]?.standardNightFeePence ?? 0,
  };
}

async function syncRefereeRecipient(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  createdFromLeadId?: string | null;
  standardNightFeePence?: number | null;
}) {
  // A new message must not re-enable a contact's existing email/SMS opt-outs.
  // The shared upsert leaves suppression and the preference row untouched.
  const existing = await prisma.notificationRecipient.findFirst({
    where: { sourceType: NotificationRecipientSourceType.REFEREE, sourceId: input.userId },
    select: {
      transactionalEmailOptIn: true,
      transactionalSmsOptIn: true,
      marketingEmailOptIn: true,
      marketingSmsOptIn: true,
    },
  });
  return upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.REFEREE,
    sourceId: input.userId,
    audience: NotificationAudience.REFEREE,
    displayName: input.name,
    email: input.email,
    phone: input.phone,
    transactionalEmailOptIn: existing?.transactionalEmailOptIn ?? true,
    transactionalSmsOptIn: existing?.transactionalSmsOptIn ?? true,
    marketingEmailOptIn: existing?.marketingEmailOptIn ?? false,
    marketingSmsOptIn: existing?.marketingSmsOptIn ?? false,
    metadata: {
      refereeUserId: input.userId,
      sourceLeadId: input.createdFromLeadId ?? null,
      standardNightFeePence: input.standardNightFeePence ?? 0,
    },
  });
}

export async function sendCentralRefereeEmailAction(formData: FormData) {
  const { user: adminUser } = await requireAdmin();
  if (!adminUser?.id) redirect("/login");

  const refereeId = readString(formData, "refereeId");
  const subject = readString(formData, "subject");
  const body = readString(formData, "body");

  if (!refereeId) redirect("/admin/referees");
  if (!subject || !body) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "Email subject and body are required." }));
  }
  if (subject.length > 200 || /[\r\n]/.test(subject) || body.length > 20000) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "Use a single-line subject of up to 200 characters and a message of up to 20,000 characters." }));
  }

  const contact = await getRefereeContact(refereeId);
  if (!contact) redirect("/admin/referees");

  const email = contact.referee.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "This referee needs a valid saved email address." }));
  }

  const recipient = await syncRefereeRecipient({
    userId: contact.referee.id,
    name: contact.referee.name,
    email,
    phone: contact.phone,
    createdFromLeadId: contact.referee.createdFromLeadId,
    standardNightFeePence: contact.standardNightFeePence,
  });

  // Individually typed correspondence, not reusable system/template copy.
  // Keep the existing central queue, renderer and provider safeguards.
  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.REFEREE,
    subject,
    body,
    sourceType: "REFEREE",
    sourceId: contact.referee.id,
    metadata: {
      refereeUserId: contact.referee.id,
      centralComms: true,
    },
    createdByUserId: adminUser.id,
  });

  if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "The email could not be queued. Check the referee’s messaging preferences and delivery settings." }));
  }

  const thread = await linkQueuedEmailDispatchToThread({
    notificationDispatchId: dispatch.id,
    recipientId: recipient.id,
    sourceType: "REFEREE",
    sourceId: contact.referee.id,
    contactName: contact.referee.name,
    toEmail: email,
    subject: dispatch.subject ?? subject,
    bodyText: dispatch.bodyText,
    bodyHtml: dispatch.bodyHtml,
    createdByUserId: adminUser.id,
  });

  revalidatePath("/admin/messaging");
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/referees/${refereeId}`);
  revalidatePath(`/admin/referees/${refereeId}`);

  redirect(getCentralRefereeCommsPath(refereeId, { saved: "email", thread: thread.id }));
}

export async function sendCentralRefereeSmsAction(formData: FormData) {
  const { user: adminUser } = await requireAdmin();

  const refereeId = readString(formData, "refereeId");
  const body = readString(formData, "body");

  if (!refereeId) redirect("/admin/referees");
  if (!body) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "SMS body is required." }));
  }

  const contact = await getRefereeContact(refereeId);
  if (!contact) redirect("/admin/referees");

  const phoneNormalized = normalizePhoneNumber(contact.phone);
  if (!phoneNormalized) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "This referee does not have a valid mobile number." }));
  }

  const recipient = await syncRefereeRecipient({
    userId: contact.referee.id,
    name: contact.referee.name,
    email: contact.referee.email,
    phone: phoneNormalized,
    createdFromLeadId: contact.referee.createdFromLeadId,
    standardNightFeePence: contact.standardNightFeePence,
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.SMS,
    audience: NotificationAudience.REFEREE,
    body,
    sourceType: "REFEREE",
    sourceId: contact.referee.id,
    metadata: {
      refereeUserId: contact.referee.id,
      centralComms: true,
    },
    createdByUserId: adminUser?.id ?? null,
  });

  if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
    redirect(getCentralRefereeCommsPath(refereeId, { error: "The SMS could not be queued." }));
  }

  await recordOutboundSms({
    notificationDispatchId: dispatch.id,
    recipientId: recipient.id,
    sourceType: "REFEREE",
    sourceId: contact.referee.id,
    contactName: contact.referee.name,
    phone: phoneNormalized,
    body: dispatch.bodyText,
    toNumber: phoneNormalized,
    provider: "twilio",
    providerStatus: "queued",
    createdByUserId: adminUser?.id ?? null,
  });

  revalidatePath("/admin/messaging");
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/referees/${refereeId}`);
  revalidatePath(`/admin/referees/${refereeId}`);

  redirect(getCentralRefereeCommsPath(refereeId, { saved: "sms" }));
}
