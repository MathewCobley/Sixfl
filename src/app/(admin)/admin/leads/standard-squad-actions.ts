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

export async function convertLeadToStandardSquadPlayerAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!leadId) {
    throw new Error("Lead ID is required.");
  }

  if (!teamId) {
    throw new Error("Standard team is required.");
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
      teamName: true,
      convertedAt: true,
      convertedTeamId: true,
    },
  });

  if (!lead) {
    throw new Error("Lead not found.");
  }

  if (lead.interestType !== "PLAYER") {
    throw new Error("Only PLAYER leads can be added to a standard squad.");
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

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    const nameParts = splitLeadName(lead.contactName);
    const playerName = lead.contactName?.trim() || [nameParts.firstName, nameParts.lastName].filter(Boolean).join(" ") || email;

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: existingUser.name?.trim() ? {} : { name: playerName },
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
        convertedTeamId: team.id,
      },
    });

    return {
      memberId: member.id,
      existingMember: Boolean(existingMember),
    };
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${lead.id}`);
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${team.id}`);
  revalidatePath(`/captain/team/${team.id}`);

  redirect(
    `/admin/leads/${lead.id}?standardSquadAdded=1&standardTeamId=${team.id}&existingMember=${result.existingMember ? "1" : "0"}&member=${result.memberId}`,
  );
}
