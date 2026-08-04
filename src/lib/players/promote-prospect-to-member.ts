import { resolveProspectPlayerAccount } from "@/lib/players/player-identity-safety";
import { prisma } from "@/lib/prisma";
import { upsertTeamMemberProfileFromProspect } from "@/lib/teamMemberProfiles";

export type PromoteProspectToMemberResult =
  | {
      ok: true;
      status: "promoted";
      membershipId: string;
      userId: string;
    }
  | {
      ok: true;
      status: "pending_email";
      membershipId: null;
      userId: null;
    }
  | {
      ok: false;
      status: "shared_email_conflict" | "not_found";
      message: string;
    };

function getProspectDisplayName(input: {
  firstName: string;
  lastName: string | null;
  email: string | null;
}) {
  return (
    [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
    input.email?.trim() ||
    "Player"
  );
}

function appendNote(existing: string | null, note: string) {
  const rows = [existing?.trim(), note.trim()].filter(Boolean);
  return Array.from(new Set(rows)).join("\n");
}

/**
 * Promote a managed-squad prospect without ever treating a shared contact
 * email as proof that two differently named players are the same person.
 *
 * The prospect can still be marked as part of the squad while login access is
 * pending, but no User or TeamMember link is created when identity is unclear.
 */
export async function promoteProspectToTeamMember(input: {
  teamId: string;
  prospectId: string;
  attemptedByUserId?: string | null;
  attemptedByEmail?: string | null;
  source: string;
}): Promise<PromoteProspectToMemberResult> {
  return prisma.$transaction(async (tx) => {
    const prospect = await tx.teamPlayerProspect.findFirst({
      where: {
        id: input.prospectId,
        teamId: input.teamId,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        ageBand: true,
        preferredPositions: true,
        experienceSummary: true,
        availabilityLevel: true,
        preferredNights: true,
        availabilitySummary: true,
        notes: true,
      },
    });

    if (!prospect) {
      return {
        ok: false as const,
        status: "not_found" as const,
        message: "Prospect not found.",
      };
    }

    const displayName = getProspectDisplayName(prospect);
    const email = prospect.email?.trim().toLowerCase() || null;

    if (!email) {
      await tx.teamPlayerProspect.update({
        where: { id: prospect.id },
        data: {
          status: "ACTIVE_SQUAD",
          source: "PROMOTED_PENDING_EMAIL",
          notes: appendNote(
            prospect.notes,
            "Squad place promoted, but dashboard activation is pending because no login email is saved.",
          ),
          lastContactedAt: new Date(),
        },
      });

      return {
        ok: true as const,
        status: "pending_email" as const,
        membershipId: null,
        userId: null,
      };
    }

    const accountResolution = await resolveProspectPlayerAccount({
      client: tx,
      teamId: input.teamId,
      prospectId: prospect.id,
      displayName,
      email,
      phone: prospect.phone,
      attemptedByUserId: input.attemptedByUserId ?? null,
      attemptedByEmail: input.attemptedByEmail ?? null,
      source: input.source,
    });

    if (!accountResolution.ok) {
      await tx.teamPlayerProspect.update({
        where: { id: prospect.id },
        data: {
          status: "ACTIVE_SQUAD",
          source: "SHARED_EMAIL_ACCOUNT_PENDING",
          notes: appendNote(prospect.notes, accountResolution.conflict.message),
          lastContactedAt: new Date(),
        },
      });

      return {
        ok: false as const,
        status: "shared_email_conflict" as const,
        message: accountResolution.conflict.message,
      };
    }

    const membership = await tx.teamMember.upsert({
      where: {
        userId_teamId: {
          userId: accountResolution.user.id,
          teamId: input.teamId,
        },
      },
      update: {
        role: "PLAYER",
      },
      create: {
        userId: accountResolution.user.id,
        teamId: input.teamId,
        role: "PLAYER",
      },
      select: { id: true },
    });

    await upsertTeamMemberProfileFromProspect({
      client: tx,
      teamMemberId: membership.id,
      prospect: {
        id: prospect.id,
        phone: prospect.phone,
        ageBand: prospect.ageBand,
        preferredPositions: prospect.preferredPositions,
        experienceSummary: prospect.experienceSummary,
        availabilityLevel: prospect.availabilityLevel,
        preferredNights: prospect.preferredNights,
        availabilitySummary: prospect.availabilitySummary,
        notes: prospect.notes,
      },
    });

    await tx.teamPlayerProspect.update({
      where: { id: prospect.id },
      data: {
        status: "ACTIVE_SQUAD",
        source: input.source,
        lastContactedAt: new Date(),
      },
    });

    return {
      ok: true as const,
      status: "promoted" as const,
      membershipId: membership.id,
      userId: accountResolution.user.id,
    };
  });
}
