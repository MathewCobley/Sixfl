// ========================================
// File: src/app/admin/leads/[id]/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { LeadStatus, TeamRole } from "@prisma/client";

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

function slugifyTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function generateUniqueClaimCode(teamName: string) {
  const base = slugifyTeamName(teamName) || "team";

  for (let i = 0; i < 10; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const claimCode = `${base}-${suffix}`;

    const existing = await prisma.team.findUnique({
      where: { claimCode },
      select: { id: true },
    });

    if (!existing) {
      return claimCode;
    }
  }

  throw new Error("Unable to generate a unique team claim code.");
}

function buildTeamNameFromLead(lead: {
  teamName: string | null;
  contactName: string;
}) {
  const explicitTeamName = lead.teamName?.trim();
  if (explicitTeamName) return explicitTeamName;

  const contactName = lead.contactName.trim();
  if (contactName) return `${contactName}'s Team`;

  return "New Team";
}

export async function sendLeadEmailAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  if (!subject) {
    return { ok: false, error: "Please enter a subject." };
  }

  if (!body) {
    return { ok: false, error: "Please enter an email message." };
  }

  const fromEmail = process.env.EMAIL_FROM;

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  if (!fromEmail) {
    return {
      ok: false,
      error: "EMAIL_FROM is missing from your environment variables.",
    };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  const signedTextBody = appendEmailSignatureText(body);
  const signedHtmlBody = buildLeadEmailHtml(body);

  try {
    await resend.emails.send({
      from: fromEmail,
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

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);

    return { ok: true };
  } catch (error) {
    console.error("sendLeadEmailAction error", error);

    return {
      ok: false,
      error:
        "The email could not be sent. Please check your Resend domain and email settings.",
    };
  }
}


export async function deleteLeadAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  try {
    await prisma.interestLead.delete({
      where: { id: leadId },
    });

    revalidatePath("/admin/leads");

    return { ok: true };
  } catch (error) {
    console.error("deleteLeadAction error", error);

    return {
      ok: false,
      error: "Failed to delete lead.",
    };
  }
}