import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normaliseColour(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function getMetadataColour(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return normaliseColour(
    (metadata as Record<string, unknown>).kitPrimaryColour,
  );
}

export async function GET() {
  const teams = await prisma.team.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
    },
  });

  const recipients = teams.length
    ? await prisma.notificationRecipient.findMany({
        where: {
          sourceType: "TEAM",
          sourceId: {
            in: teams.map((team) => team.id),
          },
        },
        select: {
          sourceId: true,
          metadata: true,
        },
      })
    : [];

  const colourByTeamId = new Map<string, string | null>();
  for (const recipient of recipients) {
    if (!recipient.sourceId) continue;
    colourByTeamId.set(
      recipient.sourceId,
      getMetadataColour(recipient.metadata),
    );
  }

  const teamsByName = new Map<
    string,
    { id: string; name: string; colour: string | null }
  >();

  for (const team of teams) {
    const key = team.name.trim().toLowerCase();
    if (!key) continue;

    const colour = colourByTeamId.get(team.id) ?? null;
    const existing = teamsByName.get(key);

    if (!existing || (!existing.colour && colour)) {
      teamsByName.set(key, {
        id: team.id,
        name: team.name.trim(),
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
