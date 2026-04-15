// ========================================
// File: src/app/(admin)/admin/leads/[id]/actions.ts
// ========================================

"use server";

// ========================================
// Imports
// ========================================

import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { LeadStatus, TeamRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import {
  buildBaseEmailTemplateContext,
  mergeEmailTemplateContext,
  resolveTemplateText,
} from "@/lib/email/template-context";

// ========================================
// Constants
// ========================================

const resend = new Resend(process.env.RESEND_API_KEY);
const CTA_PLACEHOLDER_TOKEN = "__SIXFL_CTA__";

// ========================================
// Helpers
// ========================================

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

  if (explicitTeamName) {
    return explicitTeamName;
  }

  const contactName = lead.contactName.trim();

  if (contactName) {
    return `${contactName}'s Team`;
  }

  return "New Team";
}

function buildLeadEmailContext(input: {
  contactName?: string | null;
  area?: string | null;
  signupUrl?: string | null;
  teamName?: string | null;
}) {
  const fullName = input.contactName?.trim() || "";
  const firstName = fullName.split(/\s+/)[0] || "there";

  return mergeEmailTemplateContext(
    buildBaseEmailTemplateContext({
      firstName,
      fullName,
      area: input.area,
      signupUrl: input.signupUrl,
      teamName: input.teamName,
    }),
  );
}

function resolveLeadEmailCta(input: {
  ctaLabel?: string | null;
  ctaUrlKey?: string | null;
  signupUrl?: string | null;
}) {
  const label = input.ctaLabel?.trim() || "";
  const urlKey = input.ctaUrlKey?.trim() || "";

  if (!label || !urlKey) {
    return undefined;
  }

  if (urlKey === "signupUrl") {
    const url = input.signupUrl?.trim() || "";

    if (!url) {
      return undefined;
    }

    return {
      label,
      url,
    };
  }

  return undefined;
}

// ========================================
// Actions
// ========================================

export async function sendLeadEmailAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const subjectInput = String(formData.get("subject") ?? "").trim();
  const bodyInput = String(formData.get("body") ?? "").trim();

  const signupUrl = String(formData.get("signupUrl") ?? "").trim();
  const ctaLabelInput = String(formData.get("ctaLabel") ?? "").trim();
  const ctaUrlKeyInput = String(formData.get("ctaUrlKey") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  if (!subjectInput) {
    return { ok: false, error: "Please enter a subject." };
  }

  if (!bodyInput) {
    return { ok: false, error: "Please enter an email message." };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: "RESEND_API_KEY is missing from your environment variables.",
    };
  }

  const fromEmail = process.env.EMAIL_FROM;

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

  const leadEmail = lead.email?.trim() || "";

  if (!leadEmail) {
    return {
      ok: false,
      error: "This lead does not have an email address.",
    };
  }

  const leadData = lead as typeof lead & {
    area?: string | null;
    teamName?: string | null;
  };

  const context = buildLeadEmailContext({
    contactName: lead.contactName,
    area: leadData.area ?? null,
    signupUrl,
    teamName: leadData.teamName ?? null,
  });

  const resolvedSubject = resolveTemplateText(subjectInput, context);

  const resolvedBody = resolveTemplateText(
    bodyInput.replaceAll("{{cta}}", CTA_PLACEHOLDER_TOKEN),
    context,
  ).replaceAll(CTA_PLACEHOLDER_TOKEN, "{{cta}}");

  const resolvedCta = resolveLeadEmailCta({
    ctaLabel: ctaLabelInput,
    ctaUrlKey: ctaUrlKeyInput,
    signupUrl,
  });

  const signedTextBody = appendSIXFLTextSignature(resolvedBody);

  const signedHtmlBody = buildSIXFLEmailHtml({
    body: signedTextBody,
    cta: resolvedCta,
  });

  try {
    await resend.emails.send({
      from: fromEmail,
      to: leadEmail,
      subject: resolvedSubject,
      text: signedTextBody,
      html: signedHtmlBody,
    });

    await prisma.interestLeadEmail.create({
      data: {
        interestLeadId: lead.id,
        subject: resolvedSubject,
        body: signedTextBody,
        sentTo: leadEmail,
      },
    });

    if (lead.status === LeadStatus.NEW) {
      await prisma.interestLead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.CONTACTED,
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

export async function convertLeadToTeamAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
  });

  if (!lead) {
    return { ok: false, error: "Lead not found." };
  }

  if (lead.interestType !== "TEAM") {
    return {
      ok: false,
      error: "Only team leads can be converted into teams.",
    };
  }

  if (lead.convertedTeamId) {
    return { ok: true, teamId: lead.convertedTeamId };
  }

  try {
    const teamName = buildTeamNameFromLead({
      teamName: lead.teamName,
      contactName: lead.contactName,
    });

    const claimCode = await generateUniqueClaimCode(teamName);

    const createdTeam = await prisma.team.create({
      data: {
        name: teamName,
        claimCode,
        contactName: lead.contactName || null,
        contactEmail: lead.email?.trim() || null,
        contactPhone: lead.phone?.trim() || null,
      },
      select: {
        id: true,
      },
    });

    await prisma.interestLead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CLOSED,
        closedAt: new Date(),
        convertedAt: new Date(),
        convertedTeamId: createdTeam.id,
      },
    });

    if (lead.email?.trim()) {
      const existingUser = await prisma.user.findUnique({
        where: {
          email: lead.email.trim().toLowerCase(),
        },
        select: {
          id: true,
        },
      });

      if (existingUser) {
        await prisma.teamMember.upsert({
          where: {
            userId_teamId: {
              userId: existingUser.id,
              teamId: createdTeam.id,
            },
          },
          update: {
            role: TeamRole.CAPTAIN,
          },
          create: {
            userId: existingUser.id,
            teamId: createdTeam.id,
            role: TeamRole.CAPTAIN,
          },
        });

        await prisma.team.update({
          where: { id: createdTeam.id },
          data: {
            captainUserId: existingUser.id,
            captainLinkedAt: new Date(),
            captainLinkedSource: "lead_conversion",
            captainClaimedAt: new Date(),
            captainClaimSource: "lead_conversion",
          },
        });
      }
    }

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath(`/admin/teams/${createdTeam.id}`);
    revalidatePath("/admin/teams");

    return { ok: true, teamId: createdTeam.id };
  } catch (error) {
    console.error("convertLeadToTeamAction error", error);

    return {
      ok: false,
      error: "Failed to convert lead into a team.",
    };
  }
}