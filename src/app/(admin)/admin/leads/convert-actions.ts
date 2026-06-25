// ========================================
// File: src/app/(admin)/admin/leads/convert-actions.ts
// ========================================

"use server";

import crypto from "crypto";
import { Resend } from "resend";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

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

async function generateUniqueClaimCode(tx: Prisma.TransactionClient) {
  for (let i = 0; i < 10; i += 1) {
    const claimCode = crypto.randomBytes(4).toString("hex").toUpperCase();

    const existing = await tx.team.findUnique({
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

      const claimCode = await generateUniqueClaimCode(tx);

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
  const notes = String(formData.get("notes") ?? "").trim();

  if (!leadId) {
    throw new Error("Lead ID is required.");
  }

  if (!teamId) {
    throw new Error("Managed team is required.");
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      status: true,
      contactName: true,
      email: true,
      phone: true,
      area: true,
      leagueType: true,
      message: true,
      source: true,
      preferredNights: {
        orderBy: { createdAt: "asc" },
        select: {
          night: true,
        },
      },
    },
  });

  if (!lead) {
    throw new Error("Lead not found.");
  }

  if (lead.interestType !== "PLAYER") {
    throw new Error("Only PLAYER leads can be added into a managed squad.");
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      teamMode: true,
    },
  });

  if (!team) {
    throw new Error("Managed team not found.");
  }

  if (team.teamMode !== "MANAGED") {
    throw new Error("Only managed teams can receive player leads.");
  }

  const { firstName, lastName } = splitLeadName(lead.contactName);

  const preferredNightSummary =
    lead.preferredNights.length > 0
      ? lead.preferredNights.map((entry) => entry.night).join(", ")
      : null;

  const sourceParts = ["LEAD_CONVERSION", lead.source?.trim() || null].filter(
    (value): value is string => Boolean(value),
  );

  const generatedNotes = [
    notes || null,
    lead.message?.trim() ? `Lead message: ${lead.message.trim()}` : null,
    lead.area?.trim() ? `Area: ${lead.area.trim()}` : null,
    lead.leagueType ? `League type: ${lead.leagueType}` : null,
    preferredNightSummary ? `Preferred nights: ${preferredNightSummary}` : null,
    `Source lead ID: ${lead.id}`,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");

  const duplicateWhere = [
    ...(lead.email?.trim()
      ? [
          {
            email: {
              equals: lead.email.trim(),
              mode: "insensitive" as const,
            },
          },
        ]
      : []),
    ...(lead.phone?.trim()
      ? [
          {
            phone: lead.phone.trim(),
          },
        ]
      : []),
  ];

  const duplicate = duplicateWhere.length
    ? await prisma.teamPlayerProspect.findFirst({
        where: {
          teamId: team.id,
          OR: duplicateWhere,
        },
        select: {
          id: true,
        },
      })
    : null;

  if (duplicate) {
    await prisma.interestLead.update({
      where: { id: lead.id },
      data: {
        status: "CLOSED",
        contactedAt: lead.status === "NEW" ? new Date() : undefined,
        closedAt: new Date(),
      },
    });

    const joinEmailStatus = await queueJoinConfirmationSafely({
      prospectId: duplicate.id,
      createdByUserId: user?.id ?? null,
    });

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${lead.id}`);
    revalidatePath("/admin/teams");
    revalidatePath(`/admin/teams/${team.id}`);
    revalidatePath(`/admin/teams/${team.id}/prospects/${duplicate.id}/communications`);
    revalidatePath("/admin/messaging");

    redirect(
      `/admin/leads/${lead.id}?managedSquadAdded=1&managedTeamId=${team.id}&existingProspect=1&prospect=${duplicate.id}&joinEmail=${joinEmailStatus}`,
    );
  }

  const prospect = await prisma.$transaction(async (tx) => {
    const createdProspect = await tx.teamPlayerProspect.create({
      data: {
        teamId: team.id,
        firstName,
        lastName,
        email: lead.email?.trim() || null,
        phone: lead.phone?.trim() || null,
        preferredPositions: null,
        experienceSummary: null,
        availabilitySummary: preferredNightSummary,
        source: sourceParts.join(" • "),
        status: "NEW",
        notes: generatedNotes || null,
      },
      select: {
        id: true,
      },
    });

    await tx.interestLead.update({
      where: { id: lead.id },
      data: {
        status: "CLOSED",
        contactedAt: lead.status === "NEW" ? new Date() : undefined,
        closedAt: new Date(),
      },
    });

    return createdProspect;
  });

  const joinEmailStatus = await queueJoinConfirmationSafely({
    prospectId: prospect.id,
    createdByUserId: user?.id ?? null,
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${team.id}`);
  revalidatePath(`/admin/teams/${team.id}/prospects/${prospect.id}/communications`);
  revalidatePath("/admin/messaging");

  redirect(
    `/admin/leads/${lead.id}?managedSquadAdded=1&managedTeamId=${team.id}&prospect=${prospect.id}&joinEmail=${joinEmailStatus}`,
  );
}
