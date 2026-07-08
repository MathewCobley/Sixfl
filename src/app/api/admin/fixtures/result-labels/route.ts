// ========================================
// File: src/app/api/admin/fixtures/result-labels/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const ids = Array.from(
    new Set(
      (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 150);

  if (ids.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const fixtures = await prisma.fixture.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      result: {
        select: {
          homeScore: true,
          awayScore: true,
          isDisputed: true,
        },
      },
    },
  });

  return NextResponse.json({
    results: fixtures.map((fixture) => ({
      fixtureId: fixture.id,
      status: fixture.status,
      hasResult: Boolean(fixture.result),
      homeScore: fixture.result?.homeScore ?? null,
      awayScore: fixture.result?.awayScore ?? null,
      isDisputed: fixture.result?.isDisputed ?? false,
    })),
  });
}
