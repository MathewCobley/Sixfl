// ========================================
// File: src/lib/managed-squad/movePlayerToProspect.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DbClient = typeof prisma | Prisma.TransactionClient;

type TeamMemberProfileSnapshot = {
  sourceProspectId: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: Prisma.JsonValue | null;
  availabilitySummary: string | null;
  notes: string | null;
};

type MoveResult =
  | { ok: true; prospectId: string }
  | { ok: false; reason: "TEAM_MEMBER_NOT_FOUND" | "PROSPECT_NOT_FOUND" };

function normaliseNullable(value: string | null | undefined) {
  const parsed = value?.trim();
  return parsed ? parsed : null;
}

function normaliseEmail(value: string | null | undefined) {
  return normaliseNullable(value)?.toLowerCase() ?? null;
}

function splitPlayerName(input: { name: string | null; email: string | null }) {
  const fallbackFromEmail = input.email?.split("@")[0]?.replace(/[._-]+/g, " ") ?? null;
  const base = normaliseNullable(input.name) ?? normaliseNullable(fallbackFromEmail) ?? "Player";
  const parts = base.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "Player";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;

  return { firstName, lastName };
}

async function getTeamMemberProfileSnapshot(
  teamMemberId: string,
): Promise<TeamMemberProfileSnapshot | null> {
  try {
    const rows = await prisma.$queryRaw<TeamMemberProfileSnapshot[]>`
      SELECT
        "sourceProspectId",
        "phone",
        "ageBand",
        "preferredPositions",
        "experienceSummary",
        "availabilityLevel",
        "preferredNights",
        "availabilitySummary",
        "notes"
      FROM "TeamMemberProfile"
      WHERE "teamMemberId" = ${teamMemberId}
      LIMIT 1
    `;

    return rows[0] ?? null;
  } catch (error) {
    console.warn("Could not read TeamMemberProfile while moving squad player to prospects", error);
    return null;
  }
}

async function hasPlayerInterestResponseTable() {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass('"PlayerInterestResponse"') IS NOT NULL AS "exists"
    `;

    return Boolean(rows[0]?.exists);
  } catch (error) {
    console.warn("Could not check PlayerInterestResponse table while moving squad player to prospects", error);
    return false;
  }
}

async function findReusableProspect(input: {
  client: DbClient;
  teamId: string;
  sourceProspectId: string | null;
  email: string | null;
}) {
  if (input.sourceProspectId) {
    const sourceProspect = await input.client.teamPlayerProspect.findFirst({
      where: {
        id: input.sourceProspectId,
        teamId: input.teamId,
      },
      select: {
        id: true,
      },
    });

    if (sourceProspect) {
      return sourceProspect;
    }
  }

  if (!input.email) {
    return null;
  }

  return input.client.teamPlayerProspect.findFirst({
    where: {
      teamId: input.teamId,
      email: input.email,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
    },
  });
}

function buildProspectProfileData(profile: TeamMemberProfileSnapshot | null) {
  return {
    phone: normaliseNullable(profile?.phone) ?? undefined,
    ageBand: normaliseNullable(profile?.ageBand) ?? undefined,
    preferredPositions: normaliseNullable(profile?.preferredPositions) ?? undefined,
    experienceSummary: normaliseNullable(profile?.experienceSummary) ?? undefined,
    availabilityLevel: normaliseNullable(profile?.availabilityLevel) ?? undefined,
    preferredNights: profile?.preferredNights ?? undefined,
    availabilitySummary: normaliseNullable(profile?.availabilitySummary) ?? undefined,
    notes: normaliseNullable(profile?.notes) ?? undefined,
  };
}

export async function moveTeamMemberToProspect(input: {
  teamId: string;
  membershipId: string;
}): Promise<MoveResult> {
  const membership = await prisma.teamMember.findFirst({
    where: {
      id: input.membershipId,
      teamId: input.teamId,
    },
    select: {
      id: true,
      userId: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          captainUserId: true,
        },
      },
    },
  });

  if (!membership) {
    return { ok: false, reason: "TEAM_MEMBER_NOT_FOUND" };
  }

  const [profile, canRelinkInterestResponses] = await Promise.all([
    getTeamMemberProfileSnapshot(membership.id),
    hasPlayerInterestResponseTable(),
  ]);
  const email = normaliseEmail(membership.user.email);
  const { firstName, lastName } = splitPlayerName({
    name: membership.user.name,
    email,
  });
  const profileData = buildProspectProfileData(profile);

  return prisma.$transaction(async (tx) => {
    const reusableProspect = await findReusableProspect({
      client: tx,
      teamId: input.teamId,
      sourceProspectId: profile?.sourceProspectId ?? null,
      email,
    });

    const prospect = reusableProspect
      ? await tx.teamPlayerProspect.update({
          where: { id: reusableProspect.id },
          data: {
            firstName,
            lastName,
            email,
            status: "BACKUP",
            ...profileData,
          },
          select: { id: true },
        })
      : await tx.teamPlayerProspect.create({
          data: {
            teamId: input.teamId,
            firstName,
            lastName,
            email,
            status: "BACKUP",
            source: "Moved from active squad",
            notes:
              profileData.notes ??
              `Moved back from active squad so this player can be reused later. Previous role: ${membership.role}.`,
            phone: profileData.phone,
            ageBand: profileData.ageBand,
            preferredPositions: profileData.preferredPositions,
            experienceSummary: profileData.experienceSummary,
            availabilityLevel: profileData.availabilityLevel,
            preferredNights: profileData.preferredNights,
            availabilitySummary: profileData.availabilitySummary,
          },
          select: { id: true },
        });

    if (canRelinkInterestResponses) {
      await tx.$executeRaw`
        UPDATE "PlayerInterestResponse"
        SET "prospectId" = ${prospect.id},
            "teamMemberId" = NULL,
            "updatedAt" = NOW()
        WHERE "teamMemberId" = ${membership.id}
      `;
    }

    await tx.teamMember.delete({
      where: { id: membership.id },
    });

    if (membership.team.captainUserId === membership.userId) {
      await tx.team.update({
        where: { id: input.teamId },
        data: {
          captainUserId: null,
        },
      });
    }

    return { ok: true, prospectId: prospect.id } as const;
  });
}

export async function moveActiveSquadProspectBackToPipeline(input: {
  teamId: string;
  prospectId: string;
}): Promise<MoveResult> {
  const prospect = await prisma.teamPlayerProspect.findFirst({
    where: {
      id: input.prospectId,
      teamId: input.teamId,
    },
    select: {
      id: true,
    },
  });

  if (!prospect) {
    return { ok: false, reason: "PROSPECT_NOT_FOUND" };
  }

  const updatedProspect = await prisma.teamPlayerProspect.update({
    where: { id: prospect.id },
    data: {
      status: "BACKUP",
    },
    select: {
      id: true,
    },
  });

  return { ok: true, prospectId: updatedProspect.id };
}
