// ========================================
// File: src/app/api/admin/payments/player-fee-labels/route.ts
// ========================================

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerFeePaymentLabel = {
  transactionId: string;
  teamName: string;
  amountPence: number;
  paidAt: Date;
  method: string;
  reference: string | null;
  playerName: string | null;
  playerContact: string | null;
  fixtureName: string | null;
  kickoffAt: Date | null;
};

type SubscriptionPaymentLabel = {
  transactionId: string;
  teamName: string;
  amountPence: number;
  paidAt: Date;
  method: string;
  reference: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

type DisplayPaymentLabel = {
  transactionId: string;
  teamName: string;
  amountPence: number;
  paidAt: Date;
  reference: string | null;
  title: string;
  subtitle: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Could not load payment labels.";
}

async function ensurePaymentTransactionPlayerFeeColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "PaymentTransaction"
      ADD COLUMN IF NOT EXISTS "playerMatchFeeId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PaymentTransaction_playerMatchFeeId_idx"
      ON "PaymentTransaction"("playerMatchFeeId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'PaymentTransaction_playerMatchFeeId_fkey'
      ) THEN
        ALTER TABLE "PaymentTransaction"
          ADD CONSTRAINT "PaymentTransaction_playerMatchFeeId_fkey"
          FOREIGN KEY ("playerMatchFeeId") REFERENCES "PlayerMatchFee"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "PaymentTransaction" tx
    SET "playerMatchFeeId" = match.player_match_fee_id
    FROM (
      SELECT
        id,
        substring("notes" from 'Player fee ID: ([A-Za-z0-9_-]+)') AS player_match_fee_id
      FROM "PaymentTransaction"
      WHERE "playerMatchFeeId" IS NULL
        AND "notes" LIKE '%Player fee ID:%'
    ) match
    WHERE tx.id = match.id
      AND match.player_match_fee_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "PlayerMatchFee" fee
        WHERE fee.id = match.player_match_fee_id
      );
  `);
}

function compact(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function formatPaymentMethod(method: string) {
  return method
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPlayerTitle(row: PlayerFeePaymentLabel) {
  return row.playerName
    ? `${row.playerName} · Player match fee`
    : "Player match fee";
}

function buildPlayerSubtitle(row: PlayerFeePaymentLabel) {
  const parts = [
    row.fixtureName,
    row.playerContact,
    formatPaymentMethod(row.method),
  ]
    .map(compact)
    .filter((part): part is string => Boolean(part));

  return parts.join(" · ") || "Player match fee";
}

function buildSubscriptionTitle(row: SubscriptionPaymentLabel) {
  return `${row.teamName} · Team subscription payment`;
}

function buildSubscriptionSubtitle(row: SubscriptionPaymentLabel) {
  const league = [row.leagueName, row.leagueSeason].map(compact).filter(Boolean).join(" · ");
  return [league || "Recurring team subscription", formatPaymentMethod(row.method)]
    .filter(Boolean)
    .join(" · ");
}

export async function GET() {
  try {
    await requireAdmin();
    await ensurePaymentTransactionPlayerFeeColumn();

    const [playerRows, subscriptionRows] = await Promise.all([
      prisma.$queryRaw<PlayerFeePaymentLabel[]>`
        SELECT
          tx."id" AS "transactionId",
          team."name" AS "teamName",
          tx."amountPence" AS "amountPence",
          tx."paidAt" AS "paidAt",
          tx."method"::text AS "method",
          tx."reference" AS "reference",
          COALESCE(
            NULLIF(TRIM("user"."name"), ''),
            NULLIF(TRIM(CONCAT(prospect."firstName", ' ', COALESCE(prospect."lastName", ''))), ''),
            "user"."email",
            prospect."email",
            prospect."phone"
          ) AS "playerName",
          NULLIF(TRIM(CONCAT_WS(' · ', "user"."email", prospect."email", prospect."phone")), '') AS "playerContact",
          CONCAT(homeTeam."name", ' vs ', awayTeam."name") AS "fixtureName",
          fixture."kickoffAt" AS "kickoffAt"
        FROM "PaymentTransaction" tx
        INNER JOIN "PlayerMatchFee" fee ON fee."id" = tx."playerMatchFeeId"
        INNER JOIN "Team" team ON team."id" = tx."teamId"
        INNER JOIN "Fixture" fixture ON fixture."id" = fee."fixtureId"
        INNER JOIN "Team" homeTeam ON homeTeam."id" = fixture."homeTeamId"
        INNER JOIN "Team" awayTeam ON awayTeam."id" = fixture."awayTeamId"
        LEFT JOIN "TeamMember" member ON member."id" = fee."teamMemberId"
        LEFT JOIN "User" "user" ON "user"."id" = member."userId"
        LEFT JOIN "TeamPlayerProspect" prospect ON prospect."id" = fee."prospectId"
        WHERE tx."playerMatchFeeId" IS NOT NULL
        ORDER BY tx."paidAt" DESC
        LIMIT 80
      `,
      prisma.$queryRaw<SubscriptionPaymentLabel[]>`
        SELECT
          tx."id" AS "transactionId",
          team."name" AS "teamName",
          tx."amountPence" AS "amountPence",
          tx."paidAt" AS "paidAt",
          tx."method"::text AS "method",
          tx."reference" AS "reference",
          league."name" AS "leagueName",
          league."season" AS "leagueSeason"
        FROM "PaymentTransaction" tx
        INNER JOIN "Team" team ON team."id" = tx."teamId"
        LEFT JOIN "League" league ON league."id" = team."leagueId"
        WHERE tx."chargeId" IS NULL
          AND (
            tx."notes" ILIKE '%Recurring team subscription%'
            OR tx."stripeInvoiceId" IS NOT NULL
          )
        ORDER BY tx."paidAt" DESC
        LIMIT 50
      `,
    ]);

    const labels: DisplayPaymentLabel[] = [
      ...playerRows.map((row) => ({
        transactionId: row.transactionId,
        teamName: row.teamName,
        amountPence: row.amountPence,
        paidAt: row.paidAt,
        reference: row.reference,
        title: buildPlayerTitle(row),
        subtitle: buildPlayerSubtitle(row),
      })),
      ...subscriptionRows.map((row) => ({
        transactionId: row.transactionId,
        teamName: row.teamName,
        amountPence: row.amountPence,
        paidAt: row.paidAt,
        reference: row.reference,
        title: buildSubscriptionTitle(row),
        subtitle: buildSubscriptionSubtitle(row),
      })),
    ].sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()).slice(0, 100);

    return NextResponse.json({
      labels: labels.map((row) => ({
        transactionId: row.transactionId,
        teamName: row.teamName,
        amountPence: row.amountPence,
        paidAt: row.paidAt.toISOString(),
        reference: row.reference,
        title: row.title,
        subtitle: row.subtitle,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}