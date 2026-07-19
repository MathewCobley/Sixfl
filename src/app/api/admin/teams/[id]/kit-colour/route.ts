import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normaliseColour(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {} as Record<string, Prisma.InputJsonValue | null>;
  }

  return {
    ...(metadata as Record<string, Prisma.InputJsonValue | null>),
  };
}

function getStoredColour(metadata: unknown) {
  const value = getMetadataRecord(metadata).kitPrimaryColour;
  return normaliseColour(value) ?? null;
}

async function storeTeamColour(teamId: string, colour: string | null) {
  const { recipient } = await upsertTeamNotificationRecipient(teamId);
  const metadata = getMetadataRecord(recipient.metadata);

  if (colour) {
    metadata.kitPrimaryColour = colour;
  } else {
    delete metadata.kitPrimaryColour;
  }

  await prisma.notificationRecipient.update({
    where: { id: recipient.id },
    data: {
      metadata: metadata as Prisma.InputJsonObject,
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  await requireAdmin();
  const { id } = await context.params;
  const teamId = id.trim();

  if (!teamId) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  const [team, recipient] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, name: true },
    }),
    prisma.notificationRecipient.findFirst({
      where: {
        sourceType: "TEAM",
        sourceId: teamId,
      },
      select: {
        metadata: true,
      },
    }),
  ]);

  if (!team) {
    return NextResponse.json({ error: "Team not found." }, { status: 404 });
  }

  return NextResponse.json({
    teamId: team.id,
    teamName: team.name,
    colour: getStoredColour(recipient?.metadata),
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

  await Promise.all(
    affectedTeamIds.map((affectedTeamId) =>
      storeTeamColour(affectedTeamId, colour),
    ),
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
