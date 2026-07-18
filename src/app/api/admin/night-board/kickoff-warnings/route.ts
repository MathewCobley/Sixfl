// ========================================
// File: src/app/api/admin/night-board/kickoff-warnings/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

const MAX_FIXTURES_PER_REQUEST = 100;

function normaliseFixtureIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];

  return Array.from(
    new Set(
      value
        .map((fixtureId) => String(fixtureId ?? "").trim())
        .filter(Boolean),
    ),
  ).slice(0, MAX_FIXTURES_PER_REQUEST);
}

export async function POST(request: Request) {
  await requireAdmin();

  const payload = (await request.json().catch(() => null)) as { fixtureIds?: unknown } | null;
  const fixtureIds = normaliseFixtureIds(payload?.fixtureIds);

  if (fixtureIds.length === 0) {
    return NextResponse.json({ fixtures: [] });
  }

  const fixtures = await prisma.fixture.findMany({
    where: { id: { in: fixtureIds } },
    select: {
      id: true,
      homeTeam: {
        select: {
          id: true,
          name: true,
          latestKickoffTime: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          latestKickoffTime: true,
        },
      },
    },
  });

  return NextResponse.json({ fixtures });
}
