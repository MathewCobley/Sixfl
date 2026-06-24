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
type LateFeeNotice =
  | "late_fee_saved"
  | "late_fee_error"
  | "payment_late_fee_saved"
  | "payment_late_fee_error";

const ALLOWED_DECISIONS = new Set<LateFeeDecision>([
  "NONE",
  "WARNING",
  "APPLIED",
  "WAIVED",
]);

const PAYMENT_LATE_FEE_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_PAYMENT_LATE_FEE_PENCE = 1000;

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
  notice: LateFeeNotice;
  teamName?: string | null;
  fixtureId?: string | null;
  sectionId?: string | null;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("notice", input.notice);

  if (input.teamName?.trim()) {
    searchParams.set("teamName", input.teamName.trim());
  }

  const query = searchParams.toString();
  const hash = input.sectionId?.trim()
    ? `#${input.sectionId.trim()}`
    : input.fixtureId?.trim()
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

function getChargeStatus(input: { amountPence: number; paidTotalPence: number }) {
  const outstandingPence = input.amountPence - input.paidTotalPence;

  if (outstandingPence <= 0) return "PAID";
  if (input.paidTotalPence > 0) return "PART_PAID";
  return "OPEN";
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

export async function setLatePaymentAdminFeeDecisionAction(formData: FormData) {
  await requireAdmin();

  const chargeId = parseRequiredString(formData.get("chargeId"), "Charge");
  const decision = parseDecision(formData.get("decision"));
  const note = parseNote(formData.get("note"));
  const decisionNote = decision === "NONE" ? null : note;
  const now = new Date();
  let teamName: string | null = null;

  try {
    const [charge] = await prisma.$queryRaw<
      Array<{
        id: string;
        teamId: string;
        teamName: string;
        status: string;
        amountPence: number;
        dueDate: Date | null;
        paidTotalPence: number;
        latePaymentFeeStatus: LateFeeDecision;
        latePaymentFeeAmountPence: number;
      }>
    >(Prisma.sql`
      SELECT
        charge."id",
        charge."teamId",
        team."name" AS "teamName",
        charge."status"::text AS "status",
        charge."amountPence",
        charge."dueDate",
        COALESCE(SUM(transaction."amountPence"), 0)::int AS "paidTotalPence",
        charge."latePaymentFeeStatus"::text AS "latePaymentFeeStatus",
        charge."latePaymentFeeAmountPence" AS "latePaymentFeeAmountPence"
      FROM "PaymentCharge" charge
      INNER JOIN "Team" team ON team."id" = charge."teamId"
      LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
      WHERE charge."id" = ${chargeId}
      GROUP BY charge."id", team."name"
      LIMIT 1
    `);

    if (!charge || charge.status === "PAID" || charge.status === "VOID") {
      throw new Error("Charge is not open for late payment fee management.");
    }

    teamName = charge.teamName;
    const overdueAt = charge.dueDate
      ? new Date(charge.dueDate.getTime() + PAYMENT_LATE_FEE_GRACE_PERIOD_MS)
      : null;
    const isLateFeeEligible = Boolean(overdueAt && overdueAt <= now);
    const outstandingBeforeDecision = charge.amountPence - charge.paidTotalPence;

    if (decision === "APPLIED" && (!isLateFeeEligible || outstandingBeforeDecision <= 0)) {
      throw new Error("A payment admin fee can only be applied to an outstanding charge more than 7 days after the due date.");
    }

    const feeAmountPence =
      charge.latePaymentFeeAmountPence > 0
        ? charge.latePaymentFeeAmountPence
        : DEFAULT_PAYMENT_LATE_FEE_PENCE;
    const wasApplied = charge.latePaymentFeeStatus === "APPLIED";
    const willBeApplied = decision === "APPLIED";
    const amountDeltaPence =
      !wasApplied && willBeApplied
        ? feeAmountPence
        : wasApplied && !willBeApplied
          ? -feeAmountPence
          : 0;
    const nextAmountPence = Math.max(0, charge.amountPence + amountDeltaPence);
    const nextStatus = getChargeStatus({
      amountPence: nextAmountPence,
      paidTotalPence: charge.paidTotalPence,
    });

    await prisma.$executeRaw`
      UPDATE "PaymentCharge"
      SET
        "amountPence" = ${nextAmountPence},
        "status" = CAST(${nextStatus} AS "PaymentChargeStatus"),
        "latePaymentFeeStatus" = CAST(${decision} AS "PaymentLateFeeStatus"),
        "latePaymentFeeAmountPence" = ${feeAmountPence},
        "latePaymentFeeNote" = ${decisionNote},
        "latePaymentFeeWarningAt" = CASE
          WHEN CAST(${decision} AS "PaymentLateFeeStatus") = 'WARNING'
            THEN COALESCE("latePaymentFeeWarningAt", ${now})
          ELSE NULL
        END,
        "latePaymentFeeAppliedAt" = CASE
          WHEN CAST(${decision} AS "PaymentLateFeeStatus") = 'APPLIED'
            THEN COALESCE("latePaymentFeeAppliedAt", ${now})
          ELSE NULL
        END,
        "latePaymentFeeWaivedAt" = CASE
          WHEN CAST(${decision} AS "PaymentLateFeeStatus") = 'WAIVED'
            THEN COALESCE("latePaymentFeeWaivedAt", ${now})
          ELSE NULL
        END,
        "lastStripeCheckoutUrl" = CASE WHEN ${amountDeltaPence} <> 0 THEN NULL ELSE "lastStripeCheckoutUrl" END,
        "lastStripeCheckoutSessionId" = CASE WHEN ${amountDeltaPence} <> 0 THEN NULL ELSE "lastStripeCheckoutSessionId" END,
        "lastStripeCheckoutCreatedAt" = CASE WHEN ${amountDeltaPence} <> 0 THEN NULL ELSE "lastStripeCheckoutCreatedAt" END,
        "lastStripeCheckoutAmountPence" = CASE WHEN ${amountDeltaPence} <> 0 THEN NULL ELSE "lastStripeCheckoutAmountPence" END,
        "updatedAt" = ${now}
      WHERE "id" = ${chargeId}
    `;

    revalidatePath("/admin/payments");
    revalidatePath("/admin/fixtures/late-fees");
    revalidatePath(`/captain/team/${charge.teamId}`);
    revalidatePath(`/captain/team/${charge.teamId}/payments`);
  } catch (error) {
    console.error("Failed to set late payment admin fee decision", error);
    redirect(
      buildRedirect({
        notice: "payment_late_fee_error",
        teamName,
        sectionId: `payment-charge-${chargeId}`,
      }),
    );
  }

  redirect(
    buildRedirect({
      notice: "payment_late_fee_saved",
      teamName,
      sectionId: `payment-charge-${chargeId}`,
    }),
  );
}

export type PaymentLateFeeRow = {
  chargeId: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  chargeStatus: string;
  amountPence: number;
  paidTotalPence: number;
  outstandingPence: number;
  dueDate: Date | null;
  createdAt: Date;
  daysLate: number | null;
  lateFeeEligibleAt: Date | null;
  paymentLateFeeStatus: LateFeeDecision;
  paymentLateFeeAmountPence: number;
  paymentLateFeeNote: string | null;
  paymentLateFeeWarningAt: Date | null;
  paymentLateFeeAppliedAt: Date | null;
  paymentLateFeeWaivedAt: Date | null;
  fixtureId: string | null;
  kickoffAt: Date | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
};

export async function getPaymentLateFeeRows() {
  return prisma.$queryRaw<PaymentLateFeeRow[]>(Prisma.sql`
    WITH charge_totals AS (
      SELECT
        charge."id" AS "chargeId",
        charge."teamId" AS "teamId",
        team."name" AS "teamName",
        charge."title" AS "title",
        charge."description" AS "description",
        charge."status"::text AS "chargeStatus",
        charge."amountPence" AS "amountPence",
        COALESCE(SUM(transaction."amountPence"), 0)::int AS "paidTotalPence",
        (charge."amountPence" - COALESCE(SUM(transaction."amountPence"), 0))::int AS "outstandingPence",
        charge."dueDate" AS "dueDate",
        charge."createdAt" AS "createdAt",
        CASE
          WHEN charge."dueDate" IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - charge."dueDate")) / 86400)::int
        END AS "daysLate",
        CASE
          WHEN charge."dueDate" IS NULL THEN NULL
          ELSE charge."dueDate" + INTERVAL '7 days'
        END AS "lateFeeEligibleAt",
        charge."latePaymentFeeStatus"::text AS "paymentLateFeeStatus",
        charge."latePaymentFeeAmountPence" AS "paymentLateFeeAmountPence",
        charge."latePaymentFeeNote" AS "paymentLateFeeNote",
        charge."latePaymentFeeWarningAt" AS "paymentLateFeeWarningAt",
        charge."latePaymentFeeAppliedAt" AS "paymentLateFeeAppliedAt",
        charge."latePaymentFeeWaivedAt" AS "paymentLateFeeWaivedAt",
        charge."fixtureId" AS "fixtureId",
        fixture."kickoffAt" AS "kickoffAt",
        home_team."name" AS "homeTeamName",
        away_team."name" AS "awayTeamName"
      FROM "PaymentCharge" charge
      INNER JOIN "Team" team ON team."id" = charge."teamId"
      LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
      LEFT JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
      LEFT JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      LEFT JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      WHERE charge."status" NOT IN ('PAID', 'VOID')
      GROUP BY charge."id", team."name", fixture."id", home_team."name", away_team."name"
    )
    SELECT *
    FROM charge_totals
    WHERE "outstandingPence" > 0
      AND (
        ("dueDate" IS NOT NULL AND "lateFeeEligibleAt" <= NOW())
        OR "paymentLateFeeStatus" <> 'NONE'
      )
    ORDER BY
      CASE WHEN "paymentLateFeeStatus" = 'APPLIED' THEN 1 ELSE 0 END ASC,
      "lateFeeEligibleAt" ASC NULLS LAST,
      "teamName" ASC,
      "title" ASC
  `);
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
