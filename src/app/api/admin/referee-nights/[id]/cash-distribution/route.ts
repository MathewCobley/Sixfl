// ========================================
// File: src/app/api/admin/referee-nights/[id]/cash-distribution/route.ts
// ========================================

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { parseMoneyToPence, recalculateRefereeNightCashup } from "@/lib/referee-nights";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DistributionRow = {
  id: string;
  feePence: number;
  cashCollectedPence: number;
  dueToSixflPence: number;
  dueToRefereePence: number;
  cashPaidToRefereePence: number;
  cashReceivedFromRefereePence: number;
  cashDistributionNotes: string | null;
  cashDistributedAt: Date | null;
  refereeName: string | null;
  refereeEmail: string | null;
};

function remainingDueToReferee(row: DistributionRow) {
  return Math.max(0, row.dueToRefereePence - row.cashPaidToRefereePence);
}

function remainingDueToSixfl(row: DistributionRow) {
  return Math.max(0, row.dueToSixflPence - row.cashReceivedFromRefereePence);
}

function serialize(row: DistributionRow) {
  return {
    id: row.id,
    refereeName: row.refereeName,
    refereeEmail: row.refereeEmail,
    feePence: row.feePence,
    cashCollectedPence: row.cashCollectedPence,
    dueToSixflPence: row.dueToSixflPence,
    dueToRefereePence: row.dueToRefereePence,
    cashPaidToRefereePence: row.cashPaidToRefereePence,
    cashReceivedFromRefereePence: row.cashReceivedFromRefereePence,
    remainingDueToRefereePence: remainingDueToReferee(row),
    remainingDueToSixflPence: remainingDueToSixfl(row),
    cashDistributionNotes: row.cashDistributionNotes,
    cashDistributedAt: row.cashDistributedAt?.toISOString() ?? null,
  };
}

async function getDistributionRow(id: string) {
  const rows = await prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
    SELECT
      rn.id,
      rn."feePence",
      rn."cashCollectedPence",
      rn."dueToSixflPence",
      rn."dueToRefereePence",
      COALESCE(rn."cashPaidToRefereePence", 0)::int AS "cashPaidToRefereePence",
      COALESCE(rn."cashReceivedFromRefereePence", 0)::int AS "cashReceivedFromRefereePence",
      rn."cashDistributionNotes",
      rn."cashDistributedAt",
      u.name AS "refereeName",
      u.email AS "refereeEmail"
    FROM "RefereeNight" rn
    JOIN "User" u ON u.id = rn."refereeId"
    WHERE rn.id = ${id}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  await requireAdmin();
  const { id } = await params;

  const row = await getDistributionRow(id);
  if (!row) return NextResponse.json({ error: "Referee night not found." }, { status: 404 });

  return NextResponse.json(serialize(row));
}

export async function POST(request: Request, { params }: RouteContext) {
  const { user } = await requireAdmin();
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    cashPaidToRefereePounds?: string;
    cashReceivedFromRefereePounds?: string;
    cashDistributionNotes?: string;
  } | null;

  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const cashPaidToRefereePence = parseMoneyToPence(body.cashPaidToRefereePounds ?? "") ?? 0;
  const cashReceivedFromRefereePence = parseMoneyToPence(body.cashReceivedFromRefereePounds ?? "") ?? 0;
  const cashDistributionNotes = String(body.cashDistributionNotes ?? "").trim() || null;
  const hasDistribution = cashPaidToRefereePence > 0 || cashReceivedFromRefereePence > 0 || Boolean(cashDistributionNotes);

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "cashPaidToRefereePence" = ${cashPaidToRefereePence},
      "cashReceivedFromRefereePence" = ${cashReceivedFromRefereePence},
      "cashDistributionNotes" = ${cashDistributionNotes},
      "cashDistributedAt" = ${hasDistribution ? new Date() : null},
      "cashDistributedByUserId" = ${hasDistribution ? user?.id ?? null : null},
      "updatedAt" = NOW()
    WHERE id = ${id}
  `);

  await recalculateRefereeNightCashup(id);

  const row = await getDistributionRow(id);
  if (!row) return NextResponse.json({ error: "Referee night not found." }, { status: 404 });

  return NextResponse.json(serialize(row));
}
