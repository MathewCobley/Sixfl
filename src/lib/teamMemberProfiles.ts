// ========================================
// File: src/lib/teamMemberProfiles.ts
// ========================================

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

export type TeamMemberProfile = {
  id: string;
  teamMemberId: string;
  sourceProspectId: string | null;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: unknown | null;
  availabilitySummary: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProspectProfileInput = {
  id: string;
  phone: string | null;
  ageBand: string | null;
  preferredPositions: string | null;
  experienceSummary: string | null;
  availabilityLevel: string | null;
  preferredNights: Prisma.JsonValue | null;
  availabilitySummary: string | null;
  notes: string | null;
};

function trimNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function serializeJsonNullable(value: Prisma.JsonValue | null | undefined) {
  if (value === null || typeof value === "undefined") return null;
  return JSON.stringify(value);
}

async function getSafeSourceProspectId(input: {
  client: PrismaClientLike;
  teamMemberId: string;
  sourceProspectId: string;
}) {
  const existing = await input.client.$queryRaw<
    Array<{ teamMemberId: string }>
  >`
    SELECT "teamMemberId"
    FROM "TeamMemberProfile"
    WHERE "sourceProspectId" = ${input.sourceProspectId}
    LIMIT 1
  `;

  const existingTeamMemberId = existing[0]?.teamMemberId ?? null;

  if (existingTeamMemberId && existingTeamMemberId !== input.teamMemberId) {
    return null;
  }

  return input.sourceProspectId;
}

export async function upsertTeamMemberProfileFromProspect(input: {
  client: PrismaClientLike;
  teamMemberId: string;
  prospect: ProspectProfileInput;
}) {
  const id = randomUUID();
  const preferredNightsJson = serializeJsonNullable(input.prospect.preferredNights);
  const sourceProspectId = await getSafeSourceProspectId({
    client: input.client,
    teamMemberId: input.teamMemberId,
    sourceProspectId: input.prospect.id,
  });

  await input.client.$executeRawUnsafe(
    `
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
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10,
        $11,
        NOW()
      )
      ON CONFLICT ("teamMemberId") DO UPDATE SET
        "sourceProspectId" = COALESCE("TeamMemberProfile"."sourceProspectId", EXCLUDED."sourceProspectId"),
        "phone" = COALESCE(NULLIF(EXCLUDED."phone", ''), "TeamMemberProfile"."phone"),
        "ageBand" = COALESCE(NULLIF(EXCLUDED."ageBand", ''), "TeamMemberProfile"."ageBand"),
        "preferredPositions" = COALESCE(NULLIF(EXCLUDED."preferredPositions", ''), "TeamMemberProfile"."preferredPositions"),
        "experienceSummary" = COALESCE(NULLIF(EXCLUDED."experienceSummary", ''), "TeamMemberProfile"."experienceSummary"),
        "availabilityLevel" = COALESCE(NULLIF(EXCLUDED."availabilityLevel", ''), "TeamMemberProfile"."availabilityLevel"),
        "preferredNights" = COALESCE(EXCLUDED."preferredNights", "TeamMemberProfile"."preferredNights"),
        "availabilitySummary" = COALESCE(NULLIF(EXCLUDED."availabilitySummary", ''), "TeamMemberProfile"."availabilitySummary"),
        "notes" = COALESCE(NULLIF(EXCLUDED."notes", ''), "TeamMemberProfile"."notes"),
        "updatedAt" = NOW()
    `,
    id,
    input.teamMemberId,
    sourceProspectId,
    trimNullable(input.prospect.phone),
    trimNullable(input.prospect.ageBand),
    trimNullable(input.prospect.preferredPositions),
    trimNullable(input.prospect.experienceSummary),
    trimNullable(input.prospect.availabilityLevel),
    preferredNightsJson,
    trimNullable(input.prospect.availabilitySummary),
    trimNullable(input.prospect.notes),
  );
}

export async function getTeamMemberProfilesByTeamMemberIds(teamMemberIds: string[]) {
  if (teamMemberIds.length === 0) return new Map<string, TeamMemberProfile>();

  try {
    const rows = await prisma.$queryRaw<TeamMemberProfile[]>`
      SELECT
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
        "createdAt",
        "updatedAt"
      FROM "TeamMemberProfile"
      WHERE "teamMemberId" = ANY(${teamMemberIds})
    `;

    return new Map(rows.map((row) => [row.teamMemberId, row]));
  } catch {
    return new Map<string, TeamMemberProfile>();
  }
}
