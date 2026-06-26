// ========================================
// File: src/lib/fixtures/publishing.ts
// ========================================

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const UNPUBLISHED_FIXTURE_COMMUNICATION_REASON =
  "Unpublished fixture blocked: unpublished fixtures are admin drafts only and must not generate communications.";

export const publishedFixtureWhere = {
  publishedAt: {
    not: null,
  },
} as const satisfies Prisma.FixtureWhereInput;

export const publishedFixtureRelationWhere = {
  fixture: publishedFixtureWhere,
} as const;

export function isFixturePublished(fixture: { publishedAt?: Date | string | null }) {
  return fixture.publishedAt !== null && fixture.publishedAt !== undefined;
}

export function isFixtureHiddenUntilPublished(fixture: { publishedAt?: Date | string | null }) {
  return !isFixturePublished(fixture);
}

export function requirePublishedFixtureOrThrow(fixture: { publishedAt?: Date | string | null }) {
  if (!isFixturePublished(fixture)) {
    throw new Error(UNPUBLISHED_FIXTURE_COMMUNICATION_REASON);
  }
}

export function isFixtureCommunicationSourceType(sourceType?: string | null) {
  return Boolean(
    sourceType &&
      (sourceType.startsWith("FIXTURE_") ||
        sourceType.startsWith("MANAGED_SQUAD_") ||
        sourceType.startsWith("REFEREE_NIGHT_") ||
        sourceType.startsWith("PLAYER_MATCH_FEE_") ||
        sourceType === "LEAGUE_FIXTURE_DIGEST"),
  );
}

function getMetadataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getMetadataString(value: unknown, key: string) {
  const record = getMetadataRecord(value);
  const raw = record?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function getMetadataStringArray(value: unknown, key: string) {
  const record = getMetadataRecord(value);
  const raw = record?.[key];

  if (!Array.isArray(raw)) return [];

  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function sourceBaseId(sourceId?: string | null) {
  return sourceId?.split(":")[0]?.trim() || null;
}

async function getFixtureIdsForCommunicationSource(input: {
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
}) {
  const sourceType = input.sourceType?.trim() || null;

  if (!sourceType || !isFixtureCommunicationSourceType(sourceType)) {
    return [];
  }

  if (
    sourceType === "FIXTURE_MATCH_FEE" ||
    sourceType === "FIXTURE_MATCH_FEE_REMINDER" ||
    sourceType === "FIXTURE_MATCH_FEE_MANUAL_CHASE"
  ) {
    const chargeId = sourceBaseId(input.sourceId);
    if (!chargeId) return [];

    const charge = await prisma.paymentCharge.findUnique({
      where: { id: chargeId },
      select: { fixtureId: true },
    });

    return charge?.fixtureId ? [charge.fixtureId] : [];
  }

  if (sourceType.startsWith("PLAYER_MATCH_FEE_")) {
    const feeId = sourceBaseId(input.sourceId);
    if (!feeId) return [];

    const fee = await prisma.playerMatchFee.findUnique({
      where: { id: feeId },
      select: { fixtureId: true },
    });

    return fee?.fixtureId ? [fee.fixtureId] : [];
  }

  if (sourceType.startsWith("REFEREE_NIGHT_")) {
    const refereeNightId = sourceBaseId(input.sourceId);
    if (!refereeNightId) return [];

    const rows = await prisma.$queryRaw<Array<{ fixtureId: string }>>`
      SELECT "fixtureId"
      FROM "RefereeNightFixture"
      WHERE "refereeNightId" = ${refereeNightId}
    `;

    return rows.map((row) => row.fixtureId);
  }

  if (sourceType === "LEAGUE_FIXTURE_DIGEST") {
    return getMetadataStringArray(input.metadata, "fixtureIds");
  }

  const fixtureId = getMetadataString(input.metadata, "fixtureId") ?? sourceBaseId(input.sourceId);
  return fixtureId ? [fixtureId] : [];
}

export async function getUnpublishedFixtureBlockReason(input: {
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue | Prisma.JsonValue | null;
}) {
  const fixtureIds = await getFixtureIdsForCommunicationSource(input);

  if (fixtureIds.length === 0) {
    return null;
  }

  const unpublishedCount = await prisma.fixture.count({
    where: {
      id: {
        in: fixtureIds,
      },
      publishedAt: null,
    },
  });

  return unpublishedCount > 0 ? UNPUBLISHED_FIXTURE_COMMUNICATION_REASON : null;
}
