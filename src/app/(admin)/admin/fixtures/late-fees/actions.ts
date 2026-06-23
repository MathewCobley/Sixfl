// ========================================
// File: src/app/(admin)/admin/fixtures/late-fees/actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type LateFeeDecision = "NONE" | "WARNING" | "APPLIED" | "WAIVED";

const ALLOWED_DECISIONS = new Set<LateFeeDecision>([
  "NONE",
  "WARNING",
  "APPLIED",
  "WAIVED",
]);

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = String(value ?? "").trim();

  if (!parsed) {
    throw new Error(`${fieldName} is required.`);
  }

  return parsed;
}

function parseDecision(value: FormDataEntryValue | null): LateFeeDecision {
  const parsed = String(value ?? "").trim().toUpperCase() as LateFeeDecision;

  if (!ALLOWED_DECISIONS.has(parsed)) {
    throw new Error("Late fee decision is invalid.");
  }

  return parsed;
}

function parseNote(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function buildRedirect(input: {
  notice: "late_fee_saved" | "late_fee_error";
  teamName?: string | null;
  fixtureId?: string | null;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("notice", input.notice);

  if (input.teamName?.trim()) {
    searchParams.set("teamName", input.teamName.trim());
  }

  const query = searchParams.toString();
  const hash = input.fixtureId?.trim()
    ? `#fixture-${input.fixtureId.trim()}`
    : "";

  return `/admin/fixtures/late-fees?${query}${hash}`;
}

async function getFixtureTeam(input: { fixtureId: string; teamId: string }) {
  return prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    select: {
      id: true,
      kickoffAt: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      captainConfirmations: {
        where: { teamId: input.teamId },
        select: {
          status: true,
          confirmedAt: true,
          issueRaisedAt: true,
        },
        take: 1,
      },
    },
  });
}

function isTeamInFixture(input: {
  fixture: Awaited<ReturnType<typeof getFixtureTeam>>;
  teamId: string;
}) {
  return (
    input.fixture?.homeTeamId === input.teamId ||
    input.fixture?.awayTeamId === input.teamId
  );
}

function getTeamName(input: {
  fixture: NonNullable<Awaited<ReturnType<typeof getFixtureTeam>>>;
  teamId: string;
}) {
  return input.fixture.homeTeamId === input.teamId
    ? input.fixture.homeTeam.name
    : input.fixture.awayTeam.name;
}

function getConfirmationDeadline(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - 72 * 60 * 60 * 1000);
}

export async function setLateConfirmationFeeDecisionAction(formData: FormData) {
  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture");
  const teamId = parseRequiredString(formData.get("teamId"), "Team");
  const decision = parseDecision(formData.get("decision"));
  const note = parseNote(formData.get("note"));
  const decisionNote = decision === "NONE" ? null : note;
  const now = new Date();

  let teamName: string | null = null;

  try {
    const fixture = await getFixtureTeam({ fixtureId, teamId });

    if (!fixture || !isTeamInFixture({ fixture, teamId })) {
      throw new Error("Fixture/team combination was not found.");
    }

    teamName = getTeamName({ fixture, teamId });

    if (fixture.status !== "SCHEDULED") {
      throw new Error("Late confirmation fees can only be managed for scheduled fixtures.");
    }

    const confirmation = fixture.captainConfirmations[0] ?? null;
    const deadline = getConfirmationDeadline(fixture.kickoffAt);
    const confirmedOnTime = Boolean(
      confirmation?.status === "CONFIRMED" &&
        confirmation.confirmedAt &&
        confirmation.confirmedAt <= deadline,
    );
    const deadlineMissed = now > deadline && !confirmedOnTime;

    if (confirmation?.status === "ISSUE_RAISED" && decision === "APPLIED") {
      throw new Error("A fee should not be applied while a captain issue is open.");
    }

    if (decision === "APPLIED" && !deadlineMissed) {
      throw new Error("A fee can only be applied after the 72-hour confirmation deadline has been missed.");
    }

    await prisma.$executeRaw`
      INSERT INTO "FixtureConfirmationLateFee" (
        "id",
        "fixtureId",
        "teamId",
        "status",
        "amountPence",
        "note",
        "warningAt",
        "appliedAt",
        "waivedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${fixtureId},
        ${teamId},
        CAST(${decision} AS "FixtureConfirmationLateFeeStatus"),
        1000,
        ${decisionNote},
        ${decision === "WARNING" ? now : null},
        ${decision === "APPLIED" ? now : null},
        ${decision === "WAIVED" ? now : null},
        ${now},
        ${now}
      )
      ON CONFLICT ("fixtureId", "teamId") DO UPDATE SET
        "status" = CAST(${decision} AS "FixtureConfirmationLateFeeStatus"),
        "amountPence" = 1000,
        "note" = ${decisionNote},
        "warningAt" = CASE
          WHEN CAST(${decision} AS "FixtureConfirmationLateFeeStatus") = 'WARNING'
            THEN COALESCE("FixtureConfirmationLateFee"."warningAt", ${now})
          ELSE NULL
        END,
        "appliedAt" = CASE
          WHEN CAST(${decision} AS "FixtureConfirmationLateFeeStatus") = 'APPLIED'
            THEN COALESCE("FixtureConfirmationLateFee"."appliedAt", ${now})
          ELSE NULL
        END,
        "waivedAt" = CASE
          WHEN CAST(${decision} AS "FixtureConfirmationLateFeeStatus") = 'WAIVED'
            THEN COALESCE("FixtureConfirmationLateFee"."waivedAt", ${now})
          ELSE NULL
        END,
        "updatedAt" = ${now}
    `;

    revalidatePath("/admin/fixtures");
    revalidatePath("/admin/fixtures/late-fees");
    revalidatePath(`/admin/teams/${teamId}/late-fees`);
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/fixtures`);
  } catch (error) {
    console.error("Failed to set late confirmation fee decision", error);
    redirect(buildRedirect({ notice: "late_fee_error", teamName, fixtureId }));
  }

  redirect(buildRedirect({ notice: "late_fee_saved", teamName, fixtureId }));
}

export type LateConfirmationFeeRow = {
  fixtureId: string;
  kickoffAt: Date;
  fixtureStatus: string;
  leagueName: string | null;
  leagueSeason: string | null;
  venueName: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeConfirmationStatus: string | null;
  homeConfirmedAt: Date | null;
  homeIssueRaisedAt: Date | null;
  homeLastChasedAt: Date | null;
  homeLateFeeStatus: LateFeeDecision | null;
  homeLateFeeAmountPence: number | null;
  homeLateFeeNote: string | null;
  homeLateFeeWarningAt: Date | null;
  homeLateFeeAppliedAt: Date | null;
  homeLateFeeWaivedAt: Date | null;
  homeHistoryWarnings: number;
  homeHistoryApplied: number;
  homeHistoryWaived: number;
  homeHistoryLateConfirms: number;
  awayConfirmationStatus: string | null;
  awayConfirmedAt: Date | null;
  awayIssueRaisedAt: Date | null;
  awayLastChasedAt: Date | null;
  awayLateFeeStatus: LateFeeDecision | null;
  awayLateFeeAmountPence: number | null;
  awayLateFeeNote: string | null;
  awayLateFeeWarningAt: Date | null;
  awayLateFeeAppliedAt: Date | null;
  awayLateFeeWaivedAt: Date | null;
  awayHistoryWarnings: number;
  awayHistoryApplied: number;
  awayHistoryWaived: number;
  awayHistoryLateConfirms: number;
};

export async function getLateConfirmationFeeRows() {
  return prisma.$queryRaw<LateConfirmationFeeRow[]>(Prisma.sql`
    SELECT
      fixture."id" AS "fixtureId",
      fixture."kickoffAt" AS "kickoffAt",
      fixture."status"::text AS "fixtureStatus",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      venue."name" AS "venueName",
      fixture."homeTeamId" AS "homeTeamId",
      home_team."name" AS "homeTeamName",
      fixture."awayTeamId" AS "awayTeamId",
      away_team."name" AS "awayTeamName",
      home_confirmation."status"::text AS "homeConfirmationStatus",
      home_confirmation."confirmedAt" AS "homeConfirmedAt",
      home_confirmation."issueRaisedAt" AS "homeIssueRaisedAt",
      home_confirmation."lastChasedAt" AS "homeLastChasedAt",
      home_fee."status"::text AS "homeLateFeeStatus",
      home_fee."amountPence" AS "homeLateFeeAmountPence",
      home_fee."note" AS "homeLateFeeNote",
      home_fee."warningAt" AS "homeLateFeeWarningAt",
      home_fee."appliedAt" AS "homeLateFeeAppliedAt",
      home_fee."waivedAt" AS "homeLateFeeWaivedAt",
      COALESCE(home_history."warnings", 0)::int AS "homeHistoryWarnings",
      COALESCE(home_history."applied", 0)::int AS "homeHistoryApplied",
      COALESCE(home_history."waived", 0)::int AS "homeHistoryWaived",
      COALESCE(home_late_confirmations."lateConfirms", 0)::int AS "homeHistoryLateConfirms",
      away_confirmation."status"::text AS "awayConfirmationStatus",
      away_confirmation."confirmedAt" AS "awayConfirmedAt",
      away_confirmation."issueRaisedAt" AS "awayIssueRaisedAt",
      away_confirmation."lastChasedAt" AS "awayLastChasedAt",
      away_fee."status"::text AS "awayLateFeeStatus",
      away_fee."amountPence" AS "awayLateFeeAmountPence",
      away_fee."note" AS "awayLateFeeNote",
      away_fee."warningAt" AS "awayLateFeeWarningAt",
      away_fee."appliedAt" AS "awayLateFeeAppliedAt",
      away_fee."waivedAt" AS "awayLateFeeWaivedAt",
      COALESCE(away_history."warnings", 0)::int AS "awayHistoryWarnings",
      COALESCE(away_history."applied", 0)::int AS "awayHistoryApplied",
      COALESCE(away_history."waived", 0)::int AS "awayHistoryWaived",
      COALESCE(away_late_confirmations."lateConfirms", 0)::int AS "awayHistoryLateConfirms"
    FROM "Fixture" fixture
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "League" league ON league."id" = fixture."leagueId"
    LEFT JOIN "Venue" venue ON venue."id" = fixture."venueId"
    LEFT JOIN "FixtureCaptainConfirmation" home_confirmation
      ON home_confirmation."fixtureId" = fixture."id"
      AND home_confirmation."teamId" = fixture."homeTeamId"
    LEFT JOIN "FixtureCaptainConfirmation" away_confirmation
      ON away_confirmation."fixtureId" = fixture."id"
      AND away_confirmation."teamId" = fixture."awayTeamId"
    LEFT JOIN "FixtureConfirmationLateFee" home_fee
      ON home_fee."fixtureId" = fixture."id"
      AND home_fee."teamId" = fixture."homeTeamId"
    LEFT JOIN "FixtureConfirmationLateFee" away_fee
      ON away_fee."fixtureId" = fixture."id"
      AND away_fee."teamId" = fixture."awayTeamId"
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE fee."status" = 'WARNING') AS "warnings",
        COUNT(*) FILTER (WHERE fee."status" = 'APPLIED') AS "applied",
        COUNT(*) FILTER (WHERE fee."status" = 'WAIVED') AS "waived"
      FROM "FixtureConfirmationLateFee" fee
      WHERE fee."teamId" = fixture."homeTeamId"
    ) home_history ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "lateConfirms"
      FROM "FixtureCaptainConfirmation" confirmation
      INNER JOIN "Fixture" confirmation_fixture ON confirmation_fixture."id" = confirmation."fixtureId"
      WHERE confirmation."teamId" = fixture."homeTeamId"
        AND confirmation."status" = 'CONFIRMED'
        AND confirmation."confirmedAt" > confirmation_fixture."kickoffAt" - INTERVAL '72 hours'
    ) home_late_confirmations ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE fee."status" = 'WARNING') AS "warnings",
        COUNT(*) FILTER (WHERE fee."status" = 'APPLIED') AS "applied",
        COUNT(*) FILTER (WHERE fee."status" = 'WAIVED') AS "waived"
      FROM "FixtureConfirmationLateFee" fee
      WHERE fee."teamId" = fixture."awayTeamId"
    ) away_history ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "lateConfirms"
      FROM "FixtureCaptainConfirmation" confirmation
      INNER JOIN "Fixture" confirmation_fixture ON confirmation_fixture."id" = confirmation."fixtureId"
      WHERE confirmation."teamId" = fixture."awayTeamId"
        AND confirmation."status" = 'CONFIRMED'
        AND confirmation."confirmedAt" > confirmation_fixture."kickoffAt" - INTERVAL '72 hours'
    ) away_late_confirmations ON true
    WHERE fixture."status" = 'SCHEDULED'
      AND fixture."kickoffAt" >= NOW() - INTERVAL '2 days'
      AND fixture."kickoffAt" <= NOW() + INTERVAL '45 days'
    ORDER BY fixture."kickoffAt" ASC, league."name" ASC, home_team."name" ASC
  `);
}
