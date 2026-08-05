import { NextResponse } from "next/server";

import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  acceptTemporaryPlayerRequest,
  declineTemporaryPlayerRequest,
  listPendingTemporaryPlayerRequests,
} from "@/lib/temporary-player-requests";
import { TemporaryPlayerPassError } from "@/lib/temporary-player-passes";

async function fixtureBelongsToTeam(fixtureId: string, teamId: string) {
  const fixture = await prisma.fixture.findFirst({
    where: {
      id: fixtureId,
      ...publishedFixtureWhere,
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: { id: true },
  });

  return Boolean(fixture);
}

function errorResponse(error: unknown) {
  if (error instanceof TemporaryPlayerPassError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  console.error("Temporary-player request action failed.", error);
  return NextResponse.json(
    { error: "The temporary-player request could not be updated." },
    { status: 500 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const fixtureId = new URL(request.url).searchParams.get("fixtureId")?.trim();
  if (!fixtureId || !(await fixtureBelongsToTeam(fixtureId, teamid))) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  const requests = await listPendingTemporaryPlayerRequests({
    teamId: teamid,
    fixtureId,
  });

  return NextResponse.json(
    { requests },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  const body = (await request.json().catch(() => null)) as
    | {
        fixtureId?: unknown;
        requestId?: unknown;
        decision?: unknown;
      }
    | null;

  const fixtureId = String(body?.fixtureId ?? "").trim();
  const requestId = String(body?.requestId ?? "").trim();
  const decision = String(body?.decision ?? "").trim().toLowerCase();

  if (!fixtureId || !requestId || !["accept", "decline"].includes(decision)) {
    return NextResponse.json(
      { error: "Choose whether to accept or decline this request." },
      { status: 400 },
    );
  }

  if (!(await fixtureBelongsToTeam(fixtureId, teamid))) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  try {
    if (decision === "accept") {
      const player = await acceptTemporaryPlayerRequest({
        requestId,
        teamId: teamid,
        fixtureId,
        acceptedByUserId: access.user?.id ?? null,
      });

      return NextResponse.json({
        ok: true,
        decision: "accepted",
        player: { displayName: player.displayName },
      });
    }

    const player = await declineTemporaryPlayerRequest({
      requestId,
      teamId: teamid,
      fixtureId,
    });

    return NextResponse.json({
      ok: true,
      decision: "declined",
      player,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
