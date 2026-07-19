import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamKitColourRow = {
  id: string;
  name: string;
  kitPrimaryColour: string | null;
  updatedAt: Date;
};

function normaliseColour(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

export async function GET() {
  const rows = await prisma.$queryRaw<TeamKitColourRow[]>`
    SELECT "id", "name", "kitPrimaryColour", "updatedAt"
    FROM "Team"
    ORDER BY "updatedAt" DESC
  `;

  const teamsByName = new Map<
    string,
    { id: string; name: string; colour: string | null }
  >();

  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (!key) continue;

    const colour = normaliseColour(row.kitPrimaryColour);
    const existing = teamsByName.get(key);

    if (!existing || (!existing.colour && colour)) {
      teamsByName.set(key, {
        id: row.id,
        name: row.name.trim(),
        colour,
      });
    }
  }

  return NextResponse.json(
    { teams: [...teamsByName.values()] },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
