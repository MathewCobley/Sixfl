// ========================================
// File: src/app/admin/leads/convert-actions.ts
// ========================================

"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, TeamRole, UserRole } from "@prisma/client";
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

export async function convertLeadToTeamAction(
  _prevState: ConvertLeadToTeamState,
  formData: FormData
): Promise<ConvertLeadToTeamState> {
  await requireAdmin();

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
    | { teamId: string; alreadyConverted: false }
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
            "This lead appears to be converted already, but no converted team is linked."
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

      const existingUser = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          role: true,
        },
      });

      let captainUserId: string;

      if (existingUser) {
        const updatedUser = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name: existingUser.name?.trim()
              ? existingUser.name
              : freshLead.contactName?.trim() || null,
            role: existingUser.role ?? UserRole.USER,
          },
          select: {
            id: true,
          },
        });

        captainUserId = updatedUser.id;
      } else {
        const newUser = await tx.user.create({
          data: {
            name: freshLead.contactName?.trim() || null,
            email,
            role: UserRole.USER,
          },
          select: {
            id: true,
          },
        });

        captainUserId = newUser.id;
      }

      const claimCode = await generateUniqueClaimCode(tx);

      const team = await tx.team.create({
        data: {
          name: teamName,
          claimCode,
          createdByUserId: captainUserId,
        },
        select: {
          id: true,
        },
      });

      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: captainUserId,
          role: TeamRole.CAPTAIN,
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

  redirect(`/admin/teams/${result.teamId}?created=1&fromLead=${leadId}`);
}