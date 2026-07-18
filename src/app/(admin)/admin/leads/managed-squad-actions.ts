// ========================================
// File: src/app/(admin)/admin/leads/managed-squad-actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { queueManagedSquadJoinConfirmationEmail } from "@/lib/managed-squad/prospectJoinConfirmation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function splitLeadName(fullName: string | null | undefined) {
  const raw = fullName?.trim() ?? "";
  const parts = raw.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "Player", lastName: null as string | null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null as string | null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
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

function buildErrorRedirect(leadId: string, message: string) {
  const query = new URLSearchParams({
    managedSquadError: message,
  });
  return `/admin/leads/${leadId}?${query.toString()}`;
}

export async function convertLeadToManagedSquadPlayerAction(formData: FormData) {
  const { user } = await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!leadId) {
    redirect("/admin/leads");
  }

  if (!teamId) {
    redirect(buildErrorRedirect(leadId, "Select a managed squad before adding the player."));
  }

  let result: {
    leadId: string;
    teamId: string;
    prospectId: string;
    existingProspect: boolean;
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
        phone: true,
        area: true,
        leagueType: true,
        message: true,
        source: true,
        preferredNights: {
          orderBy: { createdAt: "asc" },
          select: { night: true },
        },
      },
    });

    if (!lead) {
      throw new Error("Player lead not found.");
    }

    if (lead.interestType !== "PLAYER") {
      throw new Error("Only player leads can be added to a managed squad.");
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        teamMode: true,
      },
    });

    if (!team) {
      throw new Error("The selected managed squad could not be found.");
    }

    if (team.teamMode !== "MANAGED") {
      throw new Error("The selected team is not set as a managed squad.");
    }

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
      ...(lead.phone?.trim() ? [{ phone: lead.phone.trim() }] : []),
    ];

    const duplicate = duplicateWhere.length
      ? await prisma.teamPlayerProspect.findFirst({
          where: {
            teamId: team.id,
            OR: duplicateWhere,
          },
          select: { id: true },
        })
      : null;

    if (duplicate) {
      await prisma.interestLead.update({
        where: { id: lead.id },
        data: {
          status: "CLOSED",
          contactedAt: lead.status === "NEW" ? new Date() : undefined,
          closedAt: new Date(),
          // convertedTeamId is intentionally not used for player leads. It is a
          // unique one-to-one link reserved for a TEAM lead converted into a team.
        },
      });

      result = {
        leadId: lead.id,
        teamId: team.id,
        prospectId: duplicate.id,
        existingProspect: true,
      };
    } else {
      const { firstName, lastName } = splitLeadName(lead.contactName);

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
          select: { id: true },
        });

        await tx.interestLead.update({
          where: { id: lead.id },
          data: {
            status: "CLOSED",
            contactedAt: lead.status === "NEW" ? new Date() : undefined,
            closedAt: new Date(),
            // Do not set convertedAt/convertedTeamId here: a managed squad may
            // contain many player leads, while convertedTeamId is unique.
          },
        });

        return createdProspect;
      });

      result = {
        leadId: lead.id,
        teamId: team.id,
        prospectId: prospect.id,
        existingProspect: false,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The player could not be added to the managed squad.";

    console.error("Managed squad lead conversion failed", {
      leadId,
      teamId,
      error,
    });

    redirect(buildErrorRedirect(leadId, message));
  }

  const joinEmailStatus = await queueJoinConfirmationSafely({
    prospectId: result.prospectId,
    createdByUserId: user?.id ?? null,
  });

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${result.leadId}`);
  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${result.teamId}`);
  revalidatePath(`/admin/teams/${result.teamId}/prospects/${result.prospectId}/communications`);
  revalidatePath("/admin/messaging");

  const query = new URLSearchParams({
    managedSquadAdded: "1",
    managedTeamId: result.teamId,
    prospect: result.prospectId,
    joinEmail: joinEmailStatus,
  });

  if (result.existingProspect) {
    query.set("existingProspect", "1");
  }

  redirect(`/admin/leads/${result.leadId}?${query.toString()}`);
}
