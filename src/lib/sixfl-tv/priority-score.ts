import { Prisma } from "@prisma/client";

import { parseLondonDateTime, toLondonDateInputValue } from "@/lib/datetime/london";
import { isPlayerMatchFeeTransaction } from "@/lib/payments/charge-summary";
import {
  getPlayerFeeCashReceivedPence,
  getPlayerFeeSubsidyPence,
} from "@/lib/payments/player-fee-coverage";
import { prisma } from "@/lib/prisma";

export const SIXFL_TV_PRIORITY_MATCH_COUNT = 5;
export const SIXFL_TV_PRIORITY_MIN_SCORE = 60;
export const SIXFL_TV_PRIORITY_CORE_MIN_RATE = 0.6;

type Db = Pick<typeof prisma, "$queryRaw">;

type FixtureRow = {
  fixtureId: string;
  resultId: string;
  teamId: string;
  opponentName: string;
  kickoffAt: Date;
  publishedAt: Date | null;
  teamGoals: number;
};

type ConfirmationRow = {
  fixtureId: string;
  teamId: string;
  status: string;
  confirmedAt: Date | null;
  issueRaisedAt: Date | null;
};

type MetaRow = {
  matchResultId: string;
  teamId: string;
  goalsRecorded: number;
  playerOfMatchName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PerformanceRow = {
  matchResultId: string;
  teamId: string;
  appearanceCount: number;
  ratedCount: number;
  assists: number;
  latestUpdatedAt: Date | null;
};

type ChargeRow = {
  id: string;
  fixtureId: string;
  teamId: string;
  amountPence: number;
  dueDate: Date | null;
  status: string;
  updatedAt: Date;
};

type TransactionRow = {
  chargeId: string;
  amountPence: number;
  notes: string | null;
  paidAt: Date;
};

type PlayerFeeRow = {
  fixtureId: string;
  teamId: string;
  amountPence: number;
  status: string;
  note: string | null;
  paidAt: Date | null;
  waivedAt: Date | null;
};

export type SixflTvPriorityMatchScore = {
  fixtureId: string;
  kickoffAt: Date;
  opponentName: string;
  points: number;
  paymentPoints: number;
  confirmationPoints: number;
  matchCardPoints: number;
  assistsPoints: number;
  ratingsPoints: number;
  paymentStatus: "ON_TIME" | "LATE" | "UNPAID" | "NOT_REQUIRED";
  confirmationStatus: "ON_TIME" | "LATE" | "MISSING" | "NOT_FAIR_TO_SCORE";
  matchCardStatus: "ON_TIME" | "LATE" | "INCOMPLETE";
  coreComplete: boolean;
};

export type SixflTvPriorityScore = {
  teamId: string;
  score: number;
  provisional: boolean;
  matchesCount: number;
  qualifies: boolean;
  coreCompletedMatches: number;
  matches: SixflTvPriorityMatchScore[];
};

function key(fixtureId: string, teamId: string) {
  return fixtureId + ":" + teamId;
}

function resultKey(resultId: string, teamId: string) {
  return resultId + ":" + teamId;
}

function nextDaySixPmLondon(kickoffAt: Date) {
  const dateKey = toLondonDateInputValue(kickoffAt);
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  return parseLondonDateTime(toLondonDateInputValue(next), "18:00");
}

function confirmationDeadline(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - 72 * 60 * 60 * 1000);
}

function firstSettlementAt(input: {
  charge: ChargeRow;
  transactions: TransactionRow[];
  playerFees: PlayerFeeRow[];
  dueDate: Date;
}) {
  if (input.charge.amountPence <= 0 || input.charge.status === "VOID") return input.dueDate;

  const events: Array<{ at: Date; amount: number }> = [];
  for (const transaction of input.transactions) {
    if (isPlayerMatchFeeTransaction(transaction)) continue;
    if (!Number.isFinite(transaction.amountPence) || transaction.amountPence <= 0) continue;
    events.push({ at: transaction.paidAt, amount: transaction.amountPence });
  }

  for (const fee of input.playerFees) {
    const cash = getPlayerFeeCashReceivedPence(fee);
    const subsidy = getPlayerFeeSubsidyPence(fee);
    const amount = cash + subsidy;
    if (amount <= 0) continue;
    const eventAt =
      fee.status === "WAIVED"
        ? input.dueDate
        : fee.paidAt ?? fee.waivedAt ?? input.dueDate;
    events.push({ at: eventAt, amount });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  let covered = 0;
  for (const event of events) {
    covered += event.amount;
    if (covered >= input.charge.amountPence) return event.at;
  }

  return input.charge.status === "PAID" ? input.charge.updatedAt : null;
}

export function priorityScoreTone(score: SixflTvPriorityScore) {
  if (score.score >= 85) return "HIGH";
  if (score.score >= SIXFL_TV_PRIORITY_MIN_SCORE) return "GOOD";
  if (score.score >= 40) return "LOW";
  return "AT_RISK";
}

export async function getSixflTvPriorityScores(
  teamIds: string[],
  db: Db = prisma,
  now = new Date(),
): Promise<Map<string, SixflTvPriorityScore>> {
  const uniqueTeamIds = [...new Set(teamIds.filter(Boolean))];
  if (!uniqueTeamIds.length) return new Map();

  const fixtures = await db.$queryRaw<FixtureRow[]>(Prisma.sql`
    WITH ranked AS (
      SELECT
        f.id AS "fixtureId",
        r.id AS "resultId",
        side."teamId",
        opponent.name AS "opponentName",
        f."kickoffAt",
        f."publishedAt",
        CASE WHEN f."homeTeamId" = side."teamId" THEN r."homeScore" ELSE r."awayScore" END::integer AS "teamGoals",
        ROW_NUMBER() OVER (
          PARTITION BY side."teamId"
          ORDER BY f."kickoffAt" DESC, f.id DESC
        ) AS rn
      FROM "Fixture" f
      JOIN "MatchResult" r ON r."fixtureId" = f.id
      CROSS JOIN LATERAL (
        VALUES
          (f."homeTeamId", f."awayTeamId"),
          (f."awayTeamId", f."homeTeamId")
      ) AS side("teamId", "opponentId")
      JOIN "Team" own_team ON own_team.id = side."teamId"
      JOIN "Team" opponent ON opponent.id = side."opponentId"
      WHERE side."teamId" IN (${Prisma.join(uniqueTeamIds)})
        AND f.status::text = 'COMPLETED'
        AND f."publishedAt" IS NOT NULL
        AND f."kickoffAt" < ${now}
        AND NOT own_team."isFixturePlaceholder"
        AND NOT opponent."isFixturePlaceholder"
        AND f."homeTeamId" <> f."awayTeamId"
    )
    SELECT
      "fixtureId", "resultId", "teamId", "opponentName",
      "kickoffAt", "publishedAt", "teamGoals"
    FROM ranked
    WHERE rn <= ${SIXFL_TV_PRIORITY_MATCH_COUNT}
    ORDER BY "teamId", "kickoffAt" DESC, "fixtureId" DESC
  `);

  const fixtureIds = [...new Set(fixtures.map((row) => row.fixtureId))];
  const resultIds = [...new Set(fixtures.map((row) => row.resultId))];

  if (!fixtureIds.length) {
    return new Map(
      uniqueTeamIds.map((teamId) => [
        teamId,
        {
          teamId,
          score: 100,
          provisional: true,
          matchesCount: 0,
          qualifies: true,
          coreCompletedMatches: 0,
          matches: [],
        },
      ]),
    );
  }

  const [confirmations, metadata, performances, charges, playerFees] = await Promise.all([
    db.$queryRaw<ConfirmationRow[]>(Prisma.sql`
      SELECT "fixtureId", "teamId", status::text AS status, "confirmedAt", "issueRaisedAt"
      FROM "FixtureCaptainConfirmation"
      WHERE "fixtureId" IN (${Prisma.join(fixtureIds)})
        AND "teamId" IN (${Prisma.join(uniqueTeamIds)})
    `),
    db.$queryRaw<MetaRow[]>(Prisma.sql`
      SELECT "matchResultId", "teamId", "goalsRecorded", "playerOfMatchName", "createdAt", "updatedAt"
      FROM "MatchResultTeamMeta"
      WHERE "matchResultId" IN (${Prisma.join(resultIds)})
        AND "teamId" IN (${Prisma.join(uniqueTeamIds)})
    `),
    db.$queryRaw<PerformanceRow[]>(Prisma.sql`
      SELECT
        "matchResultId",
        "teamId",
        COUNT(*) FILTER (WHERE played AND "appearanceRecorded")::integer AS "appearanceCount",
        COUNT(rating) FILTER (WHERE played AND "appearanceRecorded")::integer AS "ratedCount",
        COALESCE(SUM(assists) FILTER (WHERE played), 0)::integer AS assists,
        MAX("updatedAt") FILTER (WHERE played AND "appearanceRecorded") AS "latestUpdatedAt"
      FROM "PlayerMatchPerformance"
      WHERE "matchResultId" IN (${Prisma.join(resultIds)})
        AND "teamId" IN (${Prisma.join(uniqueTeamIds)})
      GROUP BY "matchResultId", "teamId"
    `),
    db.$queryRaw<ChargeRow[]>(Prisma.sql`
      SELECT id, "fixtureId", "teamId", "amountPence", "dueDate", status::text AS status, "updatedAt"
      FROM "PaymentCharge"
      WHERE "fixtureId" IN (${Prisma.join(fixtureIds)})
        AND "teamId" IN (${Prisma.join(uniqueTeamIds)})
    `),
    db.$queryRaw<PlayerFeeRow[]>(Prisma.sql`
      SELECT "fixtureId", "teamId", "amountPence", status::text AS status, note, "paidAt", "waivedAt"
      FROM "PlayerMatchFee"
      WHERE "fixtureId" IN (${Prisma.join(fixtureIds)})
        AND "teamId" IN (${Prisma.join(uniqueTeamIds)})
        AND status::text IN ('PAID', 'WAIVED')
    `),
  ]);

  const chargeIds = charges.map((charge) => charge.id);
  const transactions = chargeIds.length
    ? await db.$queryRaw<TransactionRow[]>(Prisma.sql`
        SELECT "chargeId", "amountPence", notes, "paidAt"
        FROM "PaymentTransaction"
        WHERE "chargeId" IN (${Prisma.join(chargeIds)})
        ORDER BY "paidAt", id
      `)
    : [];

  const confirmationByKey = new Map(confirmations.map((row) => [key(row.fixtureId, row.teamId), row]));
  const metaByKey = new Map(metadata.map((row) => [resultKey(row.matchResultId, row.teamId), row]));
  const performanceByKey = new Map(performances.map((row) => [resultKey(row.matchResultId, row.teamId), row]));
  const chargeByKey = new Map(charges.map((row) => [key(row.fixtureId, row.teamId), row]));
  const transactionsByCharge = new Map<string, TransactionRow[]>();
  for (const row of transactions) {
    const list = transactionsByCharge.get(row.chargeId) ?? [];
    list.push(row);
    transactionsByCharge.set(row.chargeId, list);
  }
  const playerFeesByKey = new Map<string, PlayerFeeRow[]>();
  for (const row of playerFees) {
    const entryKey = key(row.fixtureId, row.teamId);
    const list = playerFeesByKey.get(entryKey) ?? [];
    list.push(row);
    playerFeesByKey.set(entryKey, list);
  }

  const grouped = new Map<string, SixflTvPriorityMatchScore[]>();
  for (const fixture of fixtures) {
    const entryKey = key(fixture.fixtureId, fixture.teamId);
    const resultEntryKey = resultKey(fixture.resultId, fixture.teamId);
    const confirmation = confirmationByKey.get(entryKey);
    const meta = metaByKey.get(resultEntryKey);
    const performance = performanceByKey.get(resultEntryKey);
    const deadline = confirmationDeadline(fixture.kickoffAt);
    const cardDeadline = nextDaySixPmLondon(fixture.kickoffAt);

    let confirmationPoints = 0;
    let confirmationStatus: SixflTvPriorityMatchScore["confirmationStatus"] = "MISSING";
    if (fixture.publishedAt && fixture.publishedAt > deadline) {
      confirmationPoints = 4;
      confirmationStatus = "NOT_FAIR_TO_SCORE";
    } else {
      const responseAt =
        confirmation?.status === "CONFIRMED"
          ? confirmation.confirmedAt
          : confirmation?.status === "ISSUE_RAISED"
            ? confirmation.issueRaisedAt
            : null;
      if (responseAt && responseAt <= deadline) {
        confirmationPoints = 4;
        confirmationStatus = "ON_TIME";
      } else if (responseAt) {
        confirmationPoints = 1;
        confirmationStatus = "LATE";
      }
    }

    const appearanceCount = performance?.appearanceCount ?? 0;
    const coreComplete =
      Boolean(meta) &&
      appearanceCount > 0 &&
      meta!.goalsRecorded === fixture.teamGoals &&
      Boolean(meta!.playerOfMatchName?.trim());

    let matchCardPoints = 0;
    let matchCardStatus: SixflTvPriorityMatchScore["matchCardStatus"] = "INCOMPLETE";
    if (coreComplete && meta!.updatedAt <= cardDeadline) {
      matchCardPoints = 4;
      matchCardStatus = "ON_TIME";
    } else if (coreComplete) {
      matchCardPoints = 2;
      matchCardStatus = "LATE";
    }

    const assistsCompleteOnTime =
      coreComplete &&
      meta!.updatedAt <= cardDeadline &&
      (fixture.teamGoals === 0 || (performance?.assists ?? 0) > 0);
    const assistsPoints = assistsCompleteOnTime ? 1 : 0;

    const ratingsCompleteOnTime =
      coreComplete &&
      appearanceCount > 0 &&
      (performance?.ratedCount ?? 0) === appearanceCount &&
      Boolean(performance?.latestUpdatedAt && performance.latestUpdatedAt <= cardDeadline);
    const ratingsPoints = ratingsCompleteOnTime ? 1 : 0;

    const charge = chargeByKey.get(entryKey);
    let paymentPoints = 10;
    let paymentStatus: SixflTvPriorityMatchScore["paymentStatus"] = "NOT_REQUIRED";
    if (charge && charge.amountPence > 0 && charge.status !== "VOID") {
      const dueDate = charge.dueDate ?? fixture.kickoffAt;
      const settledAt = firstSettlementAt({
        charge,
        transactions: transactionsByCharge.get(charge.id) ?? [],
        playerFees: playerFeesByKey.get(entryKey) ?? [],
        dueDate,
      });
      if (settledAt && settledAt <= dueDate) {
        paymentPoints = 10;
        paymentStatus = "ON_TIME";
      } else if (settledAt) {
        paymentPoints = 2;
        paymentStatus = "LATE";
      } else if (dueDate > now) {
        paymentPoints = 10;
        paymentStatus = "NOT_REQUIRED";
      } else {
        paymentPoints = 0;
        paymentStatus = "UNPAID";
      }
    }

    const row: SixflTvPriorityMatchScore = {
      fixtureId: fixture.fixtureId,
      kickoffAt: fixture.kickoffAt,
      opponentName: fixture.opponentName,
      points:
        paymentPoints +
        confirmationPoints +
        matchCardPoints +
        assistsPoints +
        ratingsPoints,
      paymentPoints,
      confirmationPoints,
      matchCardPoints,
      assistsPoints,
      ratingsPoints,
      paymentStatus,
      confirmationStatus,
      matchCardStatus,
      coreComplete,
    };
    const list = grouped.get(fixture.teamId) ?? [];
    list.push(row);
    grouped.set(fixture.teamId, list);
  }

  return new Map(
    uniqueTeamIds.map((teamId) => {
      const matches = grouped.get(teamId) ?? [];
      if (!matches.length) {
        return [
          teamId,
          {
            teamId,
            score: 100,
            provisional: true,
            matchesCount: 0,
            qualifies: true,
            coreCompletedMatches: 0,
            matches,
          },
        ];
      }

      const points = matches.reduce((sum, match) => sum + match.points, 0);
      const score = Math.round((points / (matches.length * 20)) * 100);
      const coreCompletedMatches = matches.filter((match) => match.coreComplete).length;
      const coreNeeded = Math.ceil(matches.length * SIXFL_TV_PRIORITY_CORE_MIN_RATE);
      return [
        teamId,
        {
          teamId,
          score,
          provisional: matches.length < SIXFL_TV_PRIORITY_MATCH_COUNT,
          matchesCount: matches.length,
          qualifies: score >= SIXFL_TV_PRIORITY_MIN_SCORE && coreCompletedMatches >= coreNeeded,
          coreCompletedMatches,
          matches,
        },
      ];
    }),
  );
}

export async function getSixflTvPriorityScore(teamId: string, db: Db = prisma) {
  return (await getSixflTvPriorityScores([teamId], db)).get(teamId)!;
}
