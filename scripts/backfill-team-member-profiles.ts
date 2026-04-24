// ========================================
// File: scripts/backfill-team-member-profiles.ts
// ========================================

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

type BackfillCandidate = {
  teamMemberId: string;
  prospectId: string;
  userId: string;
  userName: string | null;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown | null;
  availabilitySummary: string | null;
  notes: string | null;
};

function getFullName(candidate: BackfillCandidate) {
  return [candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim();
}

function trimNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function serializeJsonNullable(value: unknown | null | undefined) {
  if (value === null || typeof value === "undefined") return null;
  return JSON.stringify(value);
}

async function main() {
  const candidates = await prisma.$queryRaw<BackfillCandidate[]>`
    SELECT
      tm."id" AS "teamMemberId",
      tp."id" AS "prospectId",
      u."id" AS "userId",
      u."name" AS "userName",
      tp."firstName",
      tp."lastName",
      tp."phone",
      tp."ageBand",
      tp."preferredPositions",
      tp."experienceSummary",
      tp."availabilityLevel",
      tp."preferredNights",
      tp."availabilitySummary",
      tp."notes"
    FROM "TeamMember" tm
    INNER JOIN "User" u
      ON u."id" = tm."userId"
    INNER JOIN "TeamPlayerProspect" tp
      ON tp."teamId" = tm."teamId"
      AND LOWER(TRIM(tp."email")) = LOWER(TRIM(u."email"))
      AND tp."status" = 'ACTIVE_SQUAD'
    LEFT JOIN "TeamMemberProfile" profile
      ON profile."teamMemberId" = tm."id"
    WHERE profile."id" IS NULL
      AND u."email" IS NOT NULL
      AND tp."email" IS NOT NULL
  `;

  let createdCount = 0;
  let updatedUserNameCount = 0;

  for (const candidate of candidates) {
    const fullName = getFullName(candidate);

    if (fullName && !candidate.userName?.trim()) {
      await prisma.user.update({
        where: { id: candidate.userId },
        data: { name: fullName },
      });
      updatedUserNameCount += 1;
    }

    await prisma.$executeRaw`
      INSERT INTO "TeamMemberProfile" (
        "id",
        "teamMemberId",
        "sourceProspectId",
        "phone",
        "ageBand",
        "preferredPositions",
        "experienceSummary",
        "availabilityLevel",
        "preferredNights",
        "availabilitySummary",
        "notes",
        "updatedAt"
      ) VALUES (
        ${randomUUID()},
        ${candidate.teamMemberId},
        ${candidate.prospectId},
        ${trimNullable(candidate.phone)},
        ${trimNullable(candidate.ageBand)},
        ${trimNullable(candidate.preferredPositions)},
        ${trimNullable(candidate.experienceSummary)},
        ${trimNullable(candidate.availabilityLevel)},
        CAST(${serializeJsonNullable(candidate.preferredNights)} AS jsonb),
        ${trimNullable(candidate.availabilitySummary)},
        ${trimNullable(candidate.notes)},
        NOW()
      )
      ON CONFLICT ("teamMemberId") DO NOTHING
    `;

    createdCount += 1;
  }

  console.log(
    `Backfill complete. Created ${createdCount} team member profile(s). Updated ${updatedUserNameCount} user name(s).`,
  );
}

main()
  .catch((error) => {
    console.error("backfill-team-member-profiles failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
