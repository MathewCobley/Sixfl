// ========================================
// File: src/app/(admin)/admin/night-board/save/route.ts
// ========================================

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function buildScopeKey(input: { boardDate: string; leagueId: string; venueId: string }) {
  return `${input.boardDate}::${input.leagueId || "all-leagues"}::${input.venueId || "all-venues"}`;
}

function clean(value: string | null) {
  return value?.trim() || "";
}

function parseOptionalPence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  return Math.round(asNumber * 100);
}

function parseOptionalPositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function parseOptionalTime(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

async function saveOverride(input: {
  boardDate: string;
  leagueId: string;
  venueId: string;
  pitchHirePence: number | null;
  nightPitchCount: number | null;
  nightStartTime: string | null;
  nightEndTime: string | null;
}) {
  const scopeKey = buildScopeKey(input);
  const hasAnyOverride =
    input.pitchHirePence !== null ||
    input.nightPitchCount !== null ||
    input.nightStartTime !== null ||
    input.nightEndTime !== null;

  if (!hasAnyOverride) {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "NightBoardOverride"
      WHERE "scopeKey" = ${scopeKey}
    `);
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "NightBoardOverride" (
      "scopeKey",
      "boardDate",
      "leagueId",
      "venueId",
      "pitchHirePence",
      "nightPitchCount",
      "nightStartTime",
      "nightEndTime",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${scopeKey},
      ${input.boardDate},
      ${input.leagueId || null},
      ${input.venueId || null},
      ${input.pitchHirePence},
      ${input.nightPitchCount},
      ${input.nightStartTime},
      ${input.nightEndTime},
      NOW(),
      NOW()
    )
    ON CONFLICT ("scopeKey") DO UPDATE
    SET
      "pitchHirePence" = EXCLUDED."pitchHirePence",
      "nightPitchCount" = EXCLUDED."nightPitchCount",
      "nightStartTime" = EXCLUDED."nightStartTime",
      "nightEndTime" = EXCLUDED."nightEndTime",
      "updatedAt" = NOW()
  `);
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const boardDate = clean(url.searchParams.get("date"));
  const leagueId = clean(url.searchParams.get("leagueId"));
  const venueId = clean(url.searchParams.get("venueId"));
  const refFee = clean(url.searchParams.get("refFee"));
  const pitchHire = clean(url.searchParams.get("pitchHire"));
  const nightPitchTotalCost = clean(url.searchParams.get("nightPitchTotalCost")) || pitchHire;
  const nightPitchCount = clean(url.searchParams.get("nightPitchCount"));
  const nightStartTime = clean(url.searchParams.get("nightStartTime"));
  const nightEndTime = clean(url.searchParams.get("nightEndTime"));

  if (/^\d{4}-\d{2}-\d{2}$/.test(boardDate)) {
    await saveOverride({
      boardDate,
      leagueId,
      venueId,
      pitchHirePence: parseOptionalPence(nightPitchTotalCost),
      nightPitchCount: parseOptionalPositiveInteger(nightPitchCount),
      nightStartTime: parseOptionalTime(nightStartTime),
      nightEndTime: parseOptionalTime(nightEndTime),
    });
  }

  const redirectParams = new URLSearchParams();
  if (boardDate) redirectParams.set("date", boardDate);
  if (leagueId) redirectParams.set("leagueId", leagueId);
  if (venueId) redirectParams.set("venueId", venueId);
  if (refFee) redirectParams.set("refFee", refFee);
  if (nightPitchTotalCost) {
    redirectParams.set("pitchHire", nightPitchTotalCost);
    redirectParams.set("nightPitchTotalCost", nightPitchTotalCost);
  }
  if (nightPitchCount) redirectParams.set("nightPitchCount", nightPitchCount);
  if (nightStartTime) redirectParams.set("nightStartTime", nightStartTime);
  if (nightEndTime) redirectParams.set("nightEndTime", nightEndTime);

  redirect(`/admin/night-board${redirectParams.toString() ? `?${redirectParams.toString()}` : ""}`);
}
