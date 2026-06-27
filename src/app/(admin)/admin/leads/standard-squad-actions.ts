// ========================================
// File: src/app/(admin)/admin/leads/standard-squad-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { TeamRole, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

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

function buildLeadRedirect(input: {
  leadId: string;
  error?: string;
  standardTeamId?: string;
  existingMember?: boolean;
  memberId?: string;
}) {
  const params = new URLSearchParams();

  if (input.error) {
    params.set("standardSquadError", input.error);
  } else if (input.standardTeamId && input.memberId) {
    params.set("standardSquadAdded", "1");
    params.set("standardTeamId", input.standardTeamId);
    params.set("existingMember", input.existingMember ? "1" : "0");
    params.set("member", input.memberId);
  }

  const query = params.toString();
  return `/admin/leads/${input.leadId}${query ? `?${query}` : ""}`;
}

export async function convertLeadToStandardSquadPlayerAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!leadId) {
    redirect("/admin/leads");
  }

  if (!teamId) {
    redirect(buildLeadRedirect({ leadId, error: "Please choose a standard squad." }));
  }

  let result: {
    teamId: string;
    memberId: string;
    existingMember: boolean;
  };

  try {
    const lead = await prisma.interestLead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        interestType: true,
        status: true,
        contactName: true,
        email: true,
        convertedAt: true,
      },
    });

    if (!lead) {
      redirect("/admin/leads");
    }

    if (lead.interestType !== "PLAYER") {
      throw new Error("Only player leads can be added to a standard squad.");
    }

    const email = lead.email?.trim().toLowerCase();

    if (!email) {
      throw new Error("This player lead needs an email address before they can be added to a standard squad.");
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
      throw new Error("Standard team not found.");
    }

    if (team.teamMode !== "STANDARD") {
      throw new Error("Only standard teams can receive players through this action.");
    }

    result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
        },
      });

      const nameParts = splitLeadName(lead.contactName);
      const playerName =
        lead.contactName?.trim() ||
        [nameParts.firstName, nameParts.lastName].filter(Boolean).join(" ") ||
        email;

      const user = existingUser
        ? existingUser.name?.trim()
          ? { id: existingUser.id }
          : await tx.user.update({
              where: { id: existingUser.id },
              data: { name: playerName },
              select: { id: true },
            })
        : await tx.user.create({
            data: {
              email,
              name: playerName,
              role: UserRole.USER,
            },
            select: { id: true },
          });

      const existingMember = await tx.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId: team.id,
          },
        },
        select: { id: true },
      });

      const member = existingMember
        ? existingMember
        : await tx.teamMember.create({
            data: {
              userId: user.id,
              teamId: team.id,
              role: TeamRole.PLAYER,
            },
            select: { id: true },
          });

      await tx.interestLead.update({
        where: { id: lead.id },
        data: {
          status: "CLOSED",
          contactedAt: lead.status === "NEW" ? new Date() : undefined,
          convertedAt: lead.convertedAt ?? new Date(),
          closedAt: new Date(),
          // Do not set convertedTeamId here. That field is unique and belongs
          // to the original team-lead-to-team conversion relationship.
        },
      });

      return {
        teamId: team.id,
        memberId: member.id,
        existingMember: Boolean(existingMember),
      };
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to add player to standard squad.";

    redirect(buildLeadRedirect({ leadId, error: message }));
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${result.teamId}`);
  revalidatePath(`/captain/team/${result.teamId}`);

  redirect(
    buildLeadRedirect({
      leadId,
      standardTeamId: result.teamId,
      existingMember: result.existingMember,
      memberId: result.memberId,
    }),
  );
}
