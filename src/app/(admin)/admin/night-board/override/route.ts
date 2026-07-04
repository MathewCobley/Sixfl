// ========================================
// File: src/app/(admin)/admin/night-board/override/route.ts
// ========================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type NightBoardOverrideRow = {
  pitchHirePence: number | null;
  nightPitchCount: number | null;
  nightStartTime: string | null;
  nightEndTime: string | null;
};

function buildScopeKey(input: { boardDate: string; leagueId: string; venueId: string }) {
  return `${input.boardDate}::${input.leagueId || "all-leagues"}::${input.venueId || "all-venues"}`;
}

function formatMoneyInputValue(pence: number | null) {
  if (pence === null) return "";
  return (pence / 100).toFixed(2);
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const boardDate = url.searchParams.get("date")?.trim() || "";
  const leagueId = url.searchParams.get("leagueId")?.trim() || "";
  const venueId = url.searchParams.get("venueId")?.trim() || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(boardDate)) {
    return NextResponse.json({
      nightPitchCount: "",
      nightStartTime: "",
      nightEndTime: "",
      nightPitchTotalCost: "",
    });
  }

  const rows = await prisma.$queryRaw<NightBoardOverrideRow[]>(Prisma.sql`
    SELECT
      "pitchHirePence"::int AS "pitchHirePence",
      "nightPitchCount"::int AS "nightPitchCount",
      "nightStartTime",
      "nightEndTime"
    FROM "NightBoardOverride"
    WHERE "scopeKey" = ${buildScopeKey({ boardDate, leagueId, venueId })}
    LIMIT 1
  `);

  const row = rows[0] ?? null;

  return NextResponse.json({
    nightPitchCount: row?.nightPitchCount ? String(row.nightPitchCount) : "",
    nightStartTime: row?.nightStartTime ?? "",
    nightEndTime: row?.nightEndTime ?? "",
    nightPitchTotalCost: formatMoneyInputValue(row?.pitchHirePence ?? null),
  });
}
