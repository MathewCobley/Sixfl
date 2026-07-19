import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type StoredKitColourRow = {
  kitPrimaryColour: string | null;
};

function normaliseColour(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

async function getStoredColour(teamId: string) {
  const rows = await prisma.$queryRaw<StoredKitColourRow[]>`
    SELECT "kitPrimaryColour"
    FROM "Team"
    WHERE "id" = ${teamId}
    LIMIT 1
  `;

  return rows[0]?.kitPrimaryColour ?? null;
}

export async function GET(_request: Request, context: RouteContext) {
  await requireAdmin();
  const { id } = await context.params;
  const teamId = id.trim();

  if (!teamId) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    colour: normaliseColour(await getStoredColour(team.id)) ?? null,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  await requireAdmin();
  const { id } = await context.params;
  const teamId = id.trim();
  const body = (await request.json().catch(() => null)) as {
    colour?: unknown;
  } | null;
  const colour = normaliseColour(body?.colour);

  if (!teamId) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  if (colour === undefined) {
    return NextResponse.json(
      { error: "Choose a valid six-digit shirt colour." },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      leagueId: true,
      league: {
        select: {
          competitionId: true,
          slug: true,
        },
      },
    },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const relatedTeams = team.league?.competitionId
    ? await prisma.team.findMany({
        where: {
          name: { equals: team.name, mode: "insensitive" },
          league: {
            is: {
              competitionId: team.league.competitionId,
            },
          },
        },
        select: {
          id: true,
          league: { select: { slug: true } },
        },
      })
    : await prisma.team.findMany({
        where: {
          name: { equals: team.name, mode: "insensitive" },
          leagueId: team.leagueId,
        },
        select: {
          id: true,
          league: { select: { slug: true } },
        },
      });

  const affectedTeamIds = Array.from(
    new Set([team.id, ...relatedTeams.map((item) => item.id)]),
  );

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "Team"
      SET "kitPrimaryColour" = ${colour}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" IN (${Prisma.join(affectedTeamIds)})
    `,
  );

  revalidatePath("/admin/teams");
  for (const affectedTeamId of affectedTeamIds) {
    revalidatePath(`/admin/teams/${affectedTeamId}`);
    revalidatePath(`/captain/team/${affectedTeamId}`);
    revalidatePath(`/captain/team/${affectedTeamId}/fixtures`);
    revalidatePath(`/captain/team/${affectedTeamId}/results`);
  }

  const leagueSlugs = new Set(
    [team.league?.slug, ...relatedTeams.map((item) => item.league?.slug)].filter(
      (value): value is string => Boolean(value),
    ),
  );

  for (const slug of leagueSlugs) {
    revalidatePath(`/leagues/${slug}`);
    revalidatePath(`/leagues/${slug}/fixtures`);
    revalidatePath(`/leagues/${slug}/results`);
  }

  return NextResponse.json({
    ok: true,
    teamId: team.id,
    teamName: team.name,
    colour,
    updatedTeams: affectedTeamIds.length,
  });
}
