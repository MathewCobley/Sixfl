// ========================================
// File: src/app/(admin)/admin/fixtures/late-fees/actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  NotificationAudience,
  NotificationChannel,
  Prisma,
} from "@prisma/client";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";

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
const PAYMENT_LATE_FEE_WARNING_SOURCE_TYPE = "PAYMENT_LATE_FEE_WARNING";

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

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatDate(value: Date | null) {
  if (!value) return "no due date set";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
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
      publishedAt: true,
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

function buildPaymentUrl(paymentToken: string | null) {
  if (!paymentToken) return `${getPublicSiteUrl()}/captain`;
  return `${getPublicSiteUrl()}/pay/charge/${encodeURIComponent(paymentToken)}`;
}

async function queueLatePaymentWarningEmail(input: {
  chargeId: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  amountPence: number;
  paidTotalPence: number;
  outstandingPence: number;
  dueDate: Date | null;
  paymentToken: string | null;
  note: string | null;
}) {
  const { recipient, snapshot } = await upsertTeamNotificationRecipient(input.teamId);
  const paymentUrl = buildPaymentUrl(input.paymentToken);
  const adminNote = input.note?.trim();
  const body = [
    `Hi ${snapshot.primaryContact.name ?? snapshot.teamName},`,
    "",
    "This is a SIXFL payment warning.",
    "",
    `Our records show the following match fee is still outstanding for ${input.teamName}:`,
    "",
    input.title,
    input.description ? input.description : null,
    `Due: ${formatDate(input.dueDate)}`,
    `Charge: ${formatMoney(input.amountPence)}`,
    `Paid: ${formatMoney(input.paidTotalPence)}`,
    `Outstanding: ${formatMoney(input.outstandingPence)}`,
    "",
    "Please arrange payment as soon as possible. If this remains unpaid, SIXFL may add a £10 admin fee for late payment.",
    adminNote ? `Admin note: ${adminNote}` : null,
    "",
    "{{cta}}",
    "",
    "If you think this is wrong, please contact SIXFL so we can check it before any admin fee is added.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: `SIXFL payment warning: ${input.teamName}`,
    body,
    isTransactional: true,
    sourceType: PAYMENT_LATE_FEE_WARNING_SOURCE_TYPE,
    sourceId: input.chargeId,
    emailCta: input.paymentToken
      ? {
          label: "Pay outstanding fee",
          url: paymentUrl,
        }
      : undefined,
    metadata: {
      chargeId: input.chargeId,
      teamId: input.teamId,
      teamName: input.teamName,
      outstandingPence: input.outstandingPence,
      dueDate: input.dueDate?.toISOString() ?? null,
    },
  });
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

    if (fixture.publishedAt === null) {
      throw new Error("Late confirmation fees can only be managed for published fixtures.");
    }

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
        title: string;
        description: string | null;
        paymentToken: string | null;
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
        charge."title",
        charge."description",
        charge."paymentToken",
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

    if (decision === "WARNING" && charge.latePaymentFeeStatus !== "WARNING") {
      await queueLatePaymentWarningEmail({
        chargeId,
        teamId: charge.teamId,
        teamName: charge.teamName,
        title: charge.title,
        description: charge.description,
        amountPence: charge.amountPence,
        paidTotalPence: charge.paidTotalPence,
        outstandingPence: outstandingBeforeDecision,
        dueDate: charge.dueDate,
        paymentToken: charge.paymentToken,
        note: decisionNote,
      });
    }

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
        fixture."id" AS "fixtureId",
        fixture."kickoffAt" AS "kickoffAt",
        home_team."name" AS "homeTeamName",
        away_team."name" AS "awayTeamName"
      FROM "PaymentCharge" charge
      INNER JOIN "Team" team ON team."id" = charge."teamId"
      LEFT JOIN "PaymentTransaction" transaction ON transaction."chargeId" = charge."id"
      LEFT JOIN "Fixture" fixture ON fixture."id" = charge."fixtureId"
      LEFT JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      LEFT JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      WHERE charge."status" IN ('OPEN', 'PART_PAID')
        AND charge."latePaymentFeeStatus" <> 'APPLIED'
      GROUP BY charge."id", team."name", fixture."id", home_team."name", away_team."name"
    )
    SELECT *
    FROM charge_totals
    WHERE "outstandingPence" > 0
      AND "daysLate" >= 7
    ORDER BY
      CASE "paymentLateFeeStatus"
        WHEN 'NONE' THEN 0
        WHEN 'WARNING' THEN 1
        WHEN 'WAIVED' THEN 2
        ELSE 3
      END,
      "daysLate" DESC NULLS LAST,
      "dueDate" ASC NULLS LAST,
      "teamName" ASC
  `);
}

export type LateConfirmationFeeRow = {
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  kickoffAt: Date;
  venueName: string | null;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  teamId: string;
  teamName: string;
  confirmationStatus: string | null;
  confirmedAt: Date | null;
  lastChasedAt: Date | null;
  decisionStatus: LateFeeDecision | null;
  decisionNote: string | null;
  historyWarnings: number;
  historyApplied: number;
  historyWaived: number;
  historyLateConfirms: number;
};

export async function getLateConfirmationFeeRows() {
  return prisma.$queryRaw<LateConfirmationFeeRow[]>(Prisma.sql`
    WITH fixture_team_candidates AS (
      SELECT
        fixture."id" AS "fixtureId",
        fixture."leagueId",
        league."name" AS "leagueName",
        league."season" AS "leagueSeason",
        fixture."kickoffAt",
        venue."name" AS "venueName",
        fixture."homeTeamId",
        home_team."name" AS "homeTeamName",
        fixture."awayTeamId",
        away_team."name" AS "awayTeamName",
        fixture."homeTeamId" AS "teamId",
        home_team."name" AS "teamName"
      FROM "Fixture" fixture
      INNER JOIN "League" league ON league."id" = fixture."leagueId"
      LEFT JOIN "Venue" venue ON venue."id" = fixture."venueId"
      INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      WHERE fixture."publishedAt" IS NOT NULL
        AND fixture."status" = 'SCHEDULED'
        AND fixture."kickoffAt" > NOW()

      UNION ALL

      SELECT
        fixture."id" AS "fixtureId",
        fixture."leagueId",
        league."name" AS "leagueName",
        league."season" AS "leagueSeason",
        fixture."kickoffAt",
        venue."name" AS "venueName",
        fixture."homeTeamId",
        home_team."name" AS "homeTeamName",
        fixture."awayTeamId",
        away_team."name" AS "awayTeamName",
        fixture."awayTeamId" AS "teamId",
        away_team."name" AS "teamName"
      FROM "Fixture" fixture
      INNER JOIN "League" league ON league."id" = fixture."leagueId"
      LEFT JOIN "Venue" venue ON venue."id" = fixture."venueId"
      INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
      INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
      WHERE fixture."publishedAt" IS NOT NULL
        AND fixture."status" = 'SCHEDULED'
        AND fixture."kickoffAt" > NOW()
    ),
    decision_counts AS (
      SELECT
        fee."teamId",
        COUNT(*) FILTER (WHERE fee."status" = 'WARNING')::int AS "historyWarnings",
        COUNT(*) FILTER (WHERE fee."status" = 'APPLIED')::int AS "historyApplied",
        COUNT(*) FILTER (WHERE fee."status" = 'WAIVED')::int AS "historyWaived"
      FROM "FixtureConfirmationLateFee" fee
      GROUP BY fee."teamId"
    ),
    late_confirm_counts AS (
      SELECT
        confirmation."teamId",
        COUNT(*)::int AS "historyLateConfirms"
      FROM "FixtureCaptainConfirmation" confirmation
      INNER JOIN "Fixture" fixture ON fixture."id" = confirmation."fixtureId"
      WHERE confirmation."status" = 'CONFIRMED'
        AND confirmation."confirmedAt" > fixture."kickoffAt" - INTERVAL '72 hours'
      GROUP BY confirmation."teamId"
    )
    SELECT
      candidate."fixtureId",
      candidate."leagueId",
      candidate."leagueName",
      candidate."leagueSeason",
      candidate."kickoffAt",
      candidate."venueName",
      candidate."homeTeamId",
      candidate."homeTeamName",
      candidate."awayTeamId",
      candidate."awayTeamName",
      candidate."teamId",
      candidate."teamName",
      confirmation."status"::text AS "confirmationStatus",
      confirmation."confirmedAt",
      confirmation."lastChasedAt",
      fee."status"::text AS "decisionStatus",
      fee."note" AS "decisionNote",
      COALESCE(decision_counts."historyWarnings", 0)::int AS "historyWarnings",
      COALESCE(decision_counts."historyApplied", 0)::int AS "historyApplied",
      COALESCE(decision_counts."historyWaived", 0)::int AS "historyWaived",
      COALESCE(late_confirm_counts."historyLateConfirms", 0)::int AS "historyLateConfirms"
    FROM fixture_team_candidates candidate
    LEFT JOIN "FixtureCaptainConfirmation" confirmation
      ON confirmation."fixtureId" = candidate."fixtureId"
      AND confirmation."teamId" = candidate."teamId"
    LEFT JOIN "FixtureConfirmationLateFee" fee
      ON fee."fixtureId" = candidate."fixtureId"
      AND fee."teamId" = candidate."teamId"
    LEFT JOIN decision_counts ON decision_counts."teamId" = candidate."teamId"
    LEFT JOIN late_confirm_counts ON late_confirm_counts."teamId" = candidate."teamId"
    WHERE candidate."kickoffAt" - INTERVAL '72 hours' < NOW()
      AND COALESCE(confirmation."status"::text, 'PENDING') <> 'CONFIRMED'
      AND COALESCE(confirmation."status"::text, 'PENDING') <> 'ISSUE_RAISED'
      AND COALESCE(fee."status"::text, 'NONE') <> 'APPLIED'
    ORDER BY candidate."kickoffAt" ASC, candidate."teamName" ASC
  `);
}
