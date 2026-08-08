import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TvFixtureRow = {
  id: string;
  kickoffAt: Date;
  sixflTvUrl: string | null;
  homeTeamName: string;
  awayTeamName: string;
};

type LatestTvItem = {
  id: string;
  fixtureId: string;
  matchup: string;
  kickoffAt: string;
  kind: "Highlights" | "Full match" | "Clip";
  href: string;
};

function normaliseHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseVideoLinks(value: string | null) {
  if (!value) return [] as string[];

  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map((part) => normaliseHttpUrl(part))
        .filter((part): part is string => Boolean(part)),
    ),
  );
}

export async function GET() {
  try {
    const fixtures = await prisma.$queryRaw<TvFixtureRow[]>(Prisma.sql`
      SELECT
        f."id",
        f."kickoffAt",
        f."sixflTvUrl",
        home."name" AS "homeTeamName",
        away."name" AS "awayTeamName"
      FROM "Fixture" f
      JOIN "Team" home ON home."id" = f."homeTeamId"
      JOIN "Team" away ON away."id" = f."awayTeamId"
      WHERE f."sixflTvUrl" IS NOT NULL
        AND BTRIM(f."sixflTvUrl") <> ''
      ORDER BY f."kickoffAt" DESC, f."updatedAt" DESC
      LIMIT 8
    `);

    const items: LatestTvItem[] = [];

    for (const fixture of fixtures) {
      const links = parseVideoLinks(fixture.sixflTvUrl);
      links.forEach((href, index) => {
        if (items.length >= 6) return;
        items.push({
          id: `${fixture.id}:${index}`,
          fixtureId: fixture.id,
          matchup: `${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
          kickoffAt: fixture.kickoffAt.toISOString(),
          kind: index === 0 ? "Highlights" : index === 1 ? "Full match" : "Clip",
          href,
        });
      });
      if (items.length >= 6) break;
    }

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Could not load homepage SIXFL TV links", error);
    return NextResponse.json({ items: [] });
  }
}
