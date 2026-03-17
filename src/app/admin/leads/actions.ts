// ========================================
// File: src/app/admin/leads/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InterestType, LeadStatus, PreferredNight } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const resend = new Resend(process.env.RESEND_API_KEY);

const SIXFL_LOGO_URL = "https://www.sixfl.co.uk/sixfl-email.png";

const SIXFL_EMAIL_SIGNATURE_TEXT = `
—
SIXFL Admin
League Operations
hello@sixfl.co.uk
www.sixfl.co.uk

6-a-side football. Done properly.
`;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function convertTextToHtml(text: string) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function appendEmailSignatureText(body: string) {
  return `${body.trim()}\n${SIXFL_EMAIL_SIGNATURE_TEXT}`.trim();
}

function buildLeadEmailHtml(body: string) {
  const bodyHtml = convertTextToHtml(body.trim());

  return `
    <div style="background:#f5f5f5;padding:24px 12px;">
      <table
        role="presentation"
        cellpadding="0"
        cellspacing="0"
        border="0"
        width="100%"
        style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;font-family:Arial,sans-serif;"
      >
        <tr>
          <td style="padding:32px 32px 12px 32px;">
            <img
              src="${SIXFL_LOGO_URL}"
              alt="SIXFL"
              width="180"
              style="display:block;width:180px;max-width:100%;height:auto;border:0;"
            />
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 28px 32px;color:#111827;font-size:15px;line-height:1.7;">
            ${bodyHtml}
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px 32px 32px;">
            <table
              role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0"
              width="100%"
              style="border-top:1px solid #e5e7eb;padding-top:20px;"
            >
              <tr>
                <td style="padding-top:20px;color:#111827;font-size:14px;line-height:1.5;">
                  <div style="font-weight:700;">SIXFL Admin</div>
                  <div style="color:#4b5563;">League Operations</div>

                  <div style="padding-top:10px;">
                    <a
                      href="mailto:hello@sixfl.co.uk"
                      style="color:#166534;text-decoration:none;"
                    >
                      hello@sixfl.co.uk
                    </a>
                  </div>

                  <div>
                    <a
                      href="https://www.sixfl.co.uk"
                      style="color:#166534;text-decoration:none;"
                    >
                      www.sixfl.co.uk
                    </a>
                  </div>

                  <div style="padding-top:12px;color:#6b7280;font-size:13px;">
                    6-a-side football. Done properly.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

function isLeadStatus(value: string): value is LeadStatus {
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
}

function isInterestType(value: string): value is InterestType {
  return value === "TEAM" || value === "PLAYER" || value === "REFEREE";
}

function isPreferredNight(value: string): value is PreferredNight {
  return (
    value === "MONDAY" ||
    value === "TUESDAY" ||
    value === "WEDNESDAY" ||
    value === "THURSDAY" ||
    value === "FRIDAY" ||
    value === "SATURDAY" ||
    value === "SUNDAY" ||
    value === "ANY"
  );
}

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim().toUpperCase();
  const returnTo = String(formData.get("returnTo") ?? "/admin/leads").trim();

  if (!id || !isLeadStatus(statusRaw)) {
    redirect(returnTo || "/admin/leads");
  }

  await prisma.interestLead.update({
    where: { id },
    data: {
      status: statusRaw,
      ...(statusRaw === "CONTACTED" ? { contactedAt: new Date() } : {}),
      ...(statusRaw === "CLOSED" ? { closedAt: new Date() } : {}),
    },
  });

  redirect(returnTo || "/admin/leads");
}

export async function sendBulkLeadEmailAction(formData: FormData) {
  await requireAdmin();

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "").trim().toUpperCase();
  const statusRaw = String(formData.get("status") ?? "").trim().toUpperCase();
  const area = String(formData.get("area") ?? "").trim();
  const nightRaw = String(formData.get("night") ?? "").trim().toUpperCase();

  if (!subject) {
    return { ok: false, error: "Please enter a subject." };
  }

  if (!body) {
    return { ok: false, error: "Please enter a message." };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  if (!process.env.EMAIL_FROM) {
    return {
      ok: false,
      error: "EMAIL_FROM is missing from your environment variables.",
    };
  }

  const where = {
    ...(typeRaw && isInterestType(typeRaw) ? { interestType: typeRaw } : {}),
    ...(statusRaw && isLeadStatus(statusRaw) ? { status: statusRaw } : {}),
    ...(area ? { area } : {}),
    ...(nightRaw && isPreferredNight(nightRaw)
      ? {
          preferredNights: {
            some: {
              night: nightRaw,
            },
          },
        }
      : {}),
  };

  const leads = await prisma.interestLead.findMany({
    where,
    select: {
      id: true,
      email: true,
      status: true,
    },
  });

  if (leads.length === 0) {
    return {
      ok: false,
      error: "No leads match the current filters.",
    };
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const lead of leads) {
    const signedTextBody = appendEmailSignatureText(body);
    const signedHtmlBody = buildLeadEmailHtml(body);

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: lead.email,
        subject,
        text: signedTextBody,
        html: signedHtmlBody,
      });

      await prisma.interestLeadEmail.create({
        data: {
          interestLeadId: lead.id,
          subject,
          body: signedTextBody,
          sentTo: lead.email,
        },
      });

      if (lead.status === "NEW") {
        await prisma.interestLead.update({
          where: { id: lead.id },
          data: {
            status: "CONTACTED",
            contactedAt: new Date(),
          },
        });
      }

      sentCount += 1;
    } catch (error) {
      console.error("sendBulkLeadEmailAction item error", lead.id, error);
      failedCount += 1;
    }
  }

  revalidatePath("/admin/leads");

  return {
    ok: true,
    sentCount,
    failedCount,
  };
}