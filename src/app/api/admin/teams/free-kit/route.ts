import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type FreeKitTeamRow = {
  id: string;
};

export async function GET() {
  await requireAdmin();

  const teams = await prisma.$queryRaw<FreeKitTeamRow[]>(Prisma.sql`
    SELECT "id"
    FROM "Team"
    WHERE "wantsFreeKit" = true
    ORDER BY "name" ASC
  `);

  return NextResponse.json({ teamIds: teams.map((team) => team.id) });
}
