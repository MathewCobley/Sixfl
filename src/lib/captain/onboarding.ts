// ========================================
// File: src/lib/captain/onboarding.ts
// ========================================

import {
  FixtureCaptainConfirmationStatus,
  Prisma,
  TeamRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const CAPTAIN_AGREEMENT_VERSION = "2.0";
export const CAPTAIN_AGREEMENT_TEXT =
  "I understand that as team captain I am responsible for keeping squad details up to date, confirming fixture availability, arranging payment of match fees, making sure my team follows SIXFL matchday rules, and complying with the current SIXFL League Rules and Match Rules.";

export type CaptainOnboardingSummary = {
  teamId: string;
  captainAgreementAcceptedAt: Date | null;
  captainAgreementAcceptedById: string | null;
  captainAgreementVersion: string | null;
  onboardingCompletedAt: Date | null;
  onboardingWelcomeEmailSentAt: Date | null;
  onboardingFirstFixtureEmailSentAt: Date | null;
  onboardingPostFirstMatchEmailSentAt: Date | null;
};

export type CaptainOnboardingStatus = CaptainOnboardingSummary & {
  squadPlayerCount: number;
  squadEmailCount: number;
  squadMissingEmailCount: number;
  hasUpcomingFixture: boolean;
  nextFixtureId: string | null;
  nextFixtureKickoffAt: Date | null;
  nextFixtureConfirmationStatus: FixtureCaptainConfirmationStatus | null;
  openTeamChargeCount: number;
  isAgreementAccepted: boolean;
  isChecklistComplete: boolean;
};

type RawCaptainOnboardingSummary = {
  id: string;
  captainAgreementAcceptedAt: Date | null;
  captainAgreementAcceptedById: string | null;
  captainAgreementVersion: string | null;
  onboardingCompletedAt: Date | null;
  onboardingWelcomeEmailSentAt: Date | null;
  onboardingFirstFixtureEmailSentAt: Date | null;
  onboardingPostFirstMatchEmailSentAt: Date | null;
};

let captainOnboardingColumnPromise: Promise<void> | null = null;

async function ensureCaptainOnboardingColumns() {
  captainOnboardingColumnPromise ??= (async () => {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Team"
        ADD COLUMN IF NOT EXISTS "captainAgreementAcceptedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "captainAgreementAcceptedById" TEXT,
        ADD COLUMN IF NOT EXISTS "captainAgreementVersion" TEXT,
        ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "onboardingWelcomeEmailSentAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "onboardingFirstFixtureEmailSentAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "onboardingPostFirstMatchEmailSentAt" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Team_captainAgreementAcceptedAt_idx"
        ON "Team"("captainAgreementAcceptedAt");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Team_onboardingCompletedAt_idx"
        ON "Team"("onboardingCompletedAt");
    `);
  })().catch((error) => {
    captainOnboardingColumnPromise = null;
    throw error;
  });

  return captainOnboardingColumnPromise;
}

function emptySummary(teamId: string): CaptainOnboardingSummary {
  return {
    teamId,
    captainAgreementAcceptedAt: null,
    captainAgreementAcceptedById: null,
    captainAgreementVersion: null,
    onboardingCompletedAt: null,
    onboardingWelcomeEmailSentAt: null,
    onboardingFirstFixtureEmailSentAt: null,
    onboardingPostFirstMatchEmailSentAt: null,
  };
}

function normaliseSummary(row: RawCaptainOnboardingSummary): CaptainOnboardingSummary {
  return {
    teamId: row.id,
    captainAgreementAcceptedAt: row.captainAgreementAcceptedAt,
    captainAgreementAcceptedById: row.captainAgreementAcceptedById,
    captainAgreementVersion: row.captainAgreementVersion,
    onboardingCompletedAt: row.onboardingCompletedAt,
    onboardingWelcomeEmailSentAt: row.onboardingWelcomeEmailSentAt,
    onboardingFirstFixtureEmailSentAt: row.onboardingFirstFixtureEmailSentAt,
    onboardingPostFirstMatchEmailSentAt: row.onboardingPostFirstMatchEmailSentAt,
  };
}

export async function getTeamOnboardingSummaries(teamIds: string[]) {
  const uniqueTeamIds = [...new Set(teamIds.filter(Boolean))];
  const summaries = new Map<string, CaptainOnboardingSummary>();

  uniqueTeamIds.forEach((teamId) => summaries.set(teamId, emptySummary(teamId)));

  if (uniqueTeamIds.length === 0) return summaries;

  try {
    await ensureCaptainOnboardingColumns();

    const rows = await prisma.$queryRaw<RawCaptainOnboardingSummary[]>`
      SELECT
        "id",
        "captainAgreementAcceptedAt",
        "captainAgreementAcceptedById",
        "captainAgreementVersion",
        "onboardingCompletedAt",
        "onboardingWelcomeEmailSentAt",
        "onboardingFirstFixtureEmailSentAt",
        "onboardingPostFirstMatchEmailSentAt"
      FROM "Team"
      WHERE "id" IN (${Prisma.join(uniqueTeamIds)})
    `;

    rows.forEach((row) => summaries.set(row.id, normaliseSummary(row)));
  } catch (error) {
    console.error("Failed to read captain onboarding columns", error);
  }

  return summaries;
}

export async function getCaptainOnboardingStatus(teamId: string): Promise<CaptainOnboardingStatus> {
  const summaries = await getTeamOnboardingSummaries([teamId]);
  const summary = summaries.get(teamId) ?? emptySummary(teamId);

  const [members, nextFixture, openTeamChargeCount] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    }),
    prisma.fixture.findFirst({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        kickoffAt: { gte: new Date() },
        status: "SCHEDULED",
      },
      orderBy: { kickoffAt: "asc" },
      select: {
        id: true,
        kickoffAt: true,
        captainConfirmations: {
          where: { teamId },
          select: { status: true },
          take: 1,
        },
      },
    }),
    prisma.paymentCharge.count({
      where: {
        teamId,
        status: { notIn: ["PAID", "VOID"] },
      },
    }),
  ]);

  const squadMembers = members.filter((member) => member.role !== TeamRole.CAPTAIN);
  const squadEmailCount = squadMembers.filter((member) => Boolean(member.user.email?.trim())).length;
  const nextFixtureConfirmationStatus = nextFixture?.captainConfirmations[0]?.status ?? null;
  const isAgreementAccepted = Boolean(summary.captainAgreementAcceptedAt);
  const availabilityComplete =
    !nextFixture ||
    nextFixtureConfirmationStatus === "CONFIRMED" ||
    nextFixtureConfirmationStatus === "ISSUE_RAISED";
  const squadComplete = squadMembers.length >= 6;
  const emailsComplete = squadMembers.length === 0 || squadEmailCount === squadMembers.length;
  const paymentsComplete = openTeamChargeCount === 0;

  return {
    ...summary,
    squadPlayerCount: squadMembers.length,
    squadEmailCount,
    squadMissingEmailCount: Math.max(squadMembers.length - squadEmailCount, 0),
    hasUpcomingFixture: Boolean(nextFixture),
    nextFixtureId: nextFixture?.id ?? null,
    nextFixtureKickoffAt: nextFixture?.kickoffAt ?? null,
    nextFixtureConfirmationStatus,
    openTeamChargeCount,
    isAgreementAccepted,
    isChecklistComplete:
      isAgreementAccepted &&
      squadComplete &&
      emailsComplete &&
      availabilityComplete &&
      paymentsComplete,
  };
}
