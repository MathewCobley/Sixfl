// ========================================
// File: src/app/(admin)/admin/leads/convert-actions.ts
// ========================================

"use server";

import crypto from "crypto";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  appendSIXFLTextSignature,
  buildSIXFLEmailHtml,
} from "@/lib/email/buildEmail";
import { createDashboardLoginLink } from "@/lib/auth/sendDashboardLoginEmail";
import { queueManagedSquadJoinConfirmationEmail } from "@/lib/managed-squad/prospectJoinConfirmation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import type { ConvertLeadToTeamState } from "./convert-action-state";

function getSafeTeamName(input: {
  manualTeamName?: string;
  leadTeamName?: string | null;
  leadContactName?: string | null;
}) {
  const manualTeamName = input.manualTeamName?.trim();
  if (manualTeamName) return manualTeamName;

  const leadTeamName = input.leadTeamName?.trim();
  if (leadTeamName) return leadTeamName;

  const leadContactName = input.leadContactName?.trim();
  if (leadContactName) return `${leadContactName} FC`;

  return "New Team";
}

function splitLeadName(fullName: string | null | undefined) {
  const raw = fullName?.trim() ?? "";

  if (!raw) {
    return {
      firstName: "Player",
      lastName: null as string | null,
    };
  }

  const parts = raw.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: null,
    };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function generateUniqueClaimCode() {
  for (let i = 0; i < 10; i += 1) {
    const claimCode = crypto.randomBytes(4).toString("hex").toUpperCase();

    const existing = await prisma.team.findUnique({
      where: { claimCode },
      select: { id: true },
    });

    if (!existing) {
      return claimCode;
    }
  }

  throw new Error("Failed to generate a unique team claim code.");
}

function getEmailFrom() {
  const from = process.env.EMAIL_FROM?.trim();

  if (!from) {
    throw new Error("Email sending is not configured.");
  }

  return from;
}

function getFirstName(name: string | null | undefined, email: string) {
  const fromName = name?.trim().split(/\s+/).filter(Boolean)[0];
  const fromEmail = email.split("@")[0]?.replace(/[._-]+/g, " ").trim().split(/\s+/)[0];

  return fromName || fromEmail || "there";
}

async function sendCaptainClaimEmail(input: {
  teamId: string;
  teamName: string;
  captainEmail: string;
  captainName: string | null;
  claimCode: string;
}) {
  const email = input.captainEmail.trim().toLowerCase();
  const loginLink = await createDashboardLoginLink({
    email,
    callbackPath: `/claim?code=${encodeURIComponent(input.claimCode)}`,
  });
  const firstName = getFirstName(input.captainName, email);
  const body = [
    `Hi ${firstName},`,
    "",
    `${input.teamName} has now been set up on SIXFL.`,
    "",
    "Use the secure button below to sign in and claim your team captain access. The claim code will be filled in for you after sign-in.",
    "",
    "{{cta}}",
    "",
    "Once claimed, you will be able to manage fixtures, squad details, player payments and availability from your captain area.",
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n");
  const textBody = [
    `Hi ${firstName},`,
    "",
    `${input.teamName} has now been set up on SIXFL.`,
    "",
    "Use this secure link to sign in and claim your team captain access:",
    loginLink.url,
    "",
    "Once claimed, you will be able to manage fixtures, squad details, player payments and availability from your captain area.",
    "",
    `Claim code: ${input.claimCode}`,
    "",
    "Thanks,",
    "SIXFL",
  ].join("\n");
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: getEmailFrom(),
    to: email,
    subject: `Claim your SIXFL captain access for ${input.teamName}`,
    text: appendSIXFLTextSignature(textBody),
    html: buildSIXFLEmailHtml({
      body,
      cta: {
        label: "Claim captain access",
        url: loginLink.url,
      },
      branding: {
        teamName: input.teamName,
      },
    }),
  });

  await prisma.team.update({
    where: { id: input.teamId },
    data: {
      captainInviteSentAt: new Date(),
      captainInviteSentTo: email,
    },
  });
}

async function sendCaptainClaimEmailSafely(input: {
  teamId: string;
  teamName: string;
  captainEmail: string;
  captainName: string | null;
  claimCode: string;
}) {
  try {
    await sendCaptainClaimEmail(input);
    return "sent" as const;
  } catch (error) {
    console.error("Failed to send captain claim email", error);
    return "error" as const;
  }
}

async function queueJoinConfirmationSafely(input: {
  prospectId: string;
  createdByUserId?: string | null;
}) {
  try {
    const result = await queueManagedSquadJoinConfirmationEmail(input);
    return result.status;
  } catch (error) {
    console.error("Failed to queue managed squad join confirmation email", error);
    return "error";
  }
}

export async function convertLeadToTeamAction(
  _prevState: ConvertLeadToTeamState,
  formData: FormData,
): Promise<ConvertLeadToTeamState> {
  const { user } = await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const manualTeamName = String(formData.get("teamName") ?? "").trim();

  if (!leadId) {
    return {
      ok: false,
      error: "Missing lead id.",
    };
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      contactName: true,
      email: true,
      teamName: true,
      convertedAt: true,
      convertedTeamId: true,
    },
  });

  if (!lead) {
    return {
      ok: false,
      error: "Lead not found.",
    };
  }

  if (lead.interestType !== "TEAM") {
    return {
      ok: false,
      error: "Only TEAM leads can be converted into teams.",
    };
  }

  if (!lead.email?.trim()) {
    return {
      ok: false,
      error: "This lead needs an email address before it can be converted.",
    };
  }

  if (lead.convertedTeamId) {
    redirect(`/admin/teams/${lead.convertedTeamId}?fromLead=${lead.id}&existing=1`);
  }

  const teamName = getSafeTeamName({
    manualTeamName,
    leadTeamName: lead.teamName,
    leadContactName: lead.contactName,
  });

  let result:
    | {
        teamId: string;
        alreadyConverted: false;
        claimCode: string;
        captainEmail: string;
        captainName: string | null;
        teamName: string;
      }
    | { teamId: string; alreadyConverted: true };

  try {
    const claimCode = await generateUniqueClaimCode();

    result = await prisma.$transaction(async (tx) => {
      const freshLead = await tx.interestLead.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          interestType: true,
          contactName: true,
          email: true,
          teamName: true,
          convertedAt: true,
          convertedTeamId: true,
        },
      });

      if (!freshLead) {
        throw new Error("Lead not found.");
      }

      if (freshLead.interestType !== "TEAM") {
        throw new Error("Only TEAM leads can be converted into teams.");
      }

      if (freshLead.convertedAt || freshLead.convertedTeamId) {
        if (!freshLead.convertedTeamId) {
          throw new Error(
            "This lead appears to be converted already, but no converted team is linked.",
          );
        }

        return {
          teamId: freshLead.convertedTeamId,
          alreadyConverted: true as const,
        };
      }

      const email = freshLead.email?.trim().toLowerCase();

      if (!email) {
        throw new Error("This lead needs an email address before it can be converted.");
      }

      const team = await tx.team.create({
        data: {
          name: teamName,
          claimCode,
          createdByUserId: user?.id ?? null,
          contactName: freshLead.contactName?.trim() || null,
          contactEmail: email,
          captainInviteSentTo: email,
        },
        select: {
          id: true,
        },
      });

      await tx.interestLead.update({
        where: {
          id: freshLead.id,
        },
        data: {
          status: "CLOSED",
          convertedAt: new Date(),
          closedAt: new Date(),
          convertedTeamId: team.id,
        },
      });

      return {
        teamId: team.id,
        alreadyConverted: false as const,
        claimCode,
        captainEmail: email,
        captainName: freshLead.contactName?.trim() || null,
        teamName,
      };
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to convert lead to team.";

    return {
      ok: false,
      error: message,
    };
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${result.teamId}`);

  if (result.alreadyConverted) {
    redirect(`/admin/teams/${result.teamId}?fromLead=${leadId}&existing=1`);
  }

  const inviteStatus = await sendCaptainClaimEmailSafely({
    teamId: result.teamId,
    teamName: result.teamName,
    captainEmail: result.captainEmail,
    captainName: result.captainName,
    claimCode: result.claimCode,
  });

  revalidatePath(`/admin/teams/${result.teamId}`);

  redirect(`/admin/teams/${result.teamId}?created=1&fromLead=${leadId}&invite=${inviteStatus}`);
}

export async function convertLeadToManagedSquadPlayerAction(formData: FormData) {
  const { user } = await requireAdmin();
  const leadId = String(formData.get("leadId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!leadId || !teamId) {
    throw new Error("Lead and team are required.");
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      contactName: true,
      email: true,
      convertedAt: true,
      convertedTeamId: true,
    },
  });

  if (!lead) {
    throw new Error("Lead not found.");
  }

  if (lead.interestType !== "PLAYER") {
    throw new Error("Only PLAYER leads can be converted into managed squad players.");
  }

  if (lead.convertedAt || lead.convertedTeamId) {
    redirect(`/admin/leads/${lead.id}?converted=existing`);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });

  if (!team) {
    throw new Error("Selected team not found.");
  }

  const nameParts = splitLeadName(lead.contactName);
  const prospect = await prisma.teamPlayerProspect.create({
    data: {
      teamId,
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: lead.email?.trim().toLowerCase() || null,
      source: "LEAD",
    },
    select: { id: true },
  });

  await prisma.interestLead.update({
    where: { id: lead.id },
    data: {
      status: "CLOSED",
      convertedAt: new Date(),
      closedAt: new Date(),
      convertedTeamId: teamId,
    },
  });

  await queueJoinConfirmationSafely({
    prospectId: prospect.id,
    createdByUserId: user?.id ?? null,
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath(`/admin/teams/${teamId}`);

  redirect(`/admin/leads/${lead.id}?converted=player`);
}
