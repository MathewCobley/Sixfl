// ========================================
// File: src/app/api/admin/teams/standard-options/route.ts
// ========================================

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();

  const teams = await prisma.team.findMany({
    where: {
      teamMode: "STANDARD",
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  return NextResponse.json({
    teams: teams.map((team) => ({
      value: team.id,
      label: team.league?.name
        ? `${team.name} • ${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
        : team.name,
    })),
  });
}
