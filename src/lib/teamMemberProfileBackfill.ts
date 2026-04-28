// ========================================
// File: src/lib/teamMemberProfileBackfill.ts
// ========================================

import { prisma } from "@/lib/prisma";
import { upsertTeamMemberProfileFromProspect } from "@/lib/teamMemberProfiles";

function normaliseEmail(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

export async function backfillTeamMemberProfilesFromProspects(input?: {
  teamId?: string | null;
}) {
  const teamId = input?.teamId?.trim() || null;

  const members = await prisma.teamMember.findMany({
    where: {
      ...(teamId ? { teamId } : {}),
      user: {
        email: {
          not: null,
        },
      },
    },
    select: {
      id: true,
      teamId: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  let scannedMembers = 0;
  let matchedProspects = 0;
  let profilesUpdated = 0;
  let phoneNumbersBackfilled = 0;

  for (const member of members) {
    scannedMembers += 1;

    const email = normaliseEmail(member.user.email);
    if (!email) continue;

    const prospect = await prisma.teamPlayerProspect.findFirst({
      where: {
        teamId: member.teamId,
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
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

    if (!prospect) continue;

    matchedProspects += 1;

    await upsertTeamMemberProfileFromProspect({
      client: prisma,
      teamMemberId: member.id,
      prospect,
    });

    profilesUpdated += 1;

    if (prospect.phone?.trim()) {
      phoneNumbersBackfilled += 1;
    }
  }

  return {
    scannedMembers,
    matchedProspects,
    profilesUpdated,
    phoneNumbersBackfilled,
  };
}
