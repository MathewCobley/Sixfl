import { NextResponse } from "next/server";

import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  redeemTemporaryPlayerPass,
  TemporaryPlayerPassError,
} from "@/lib/temporary-player-passes";

type TemporaryPlayerRow = {
  id: string;
  firstName: string;
  surnameInitial: string;
  status: string;
  amountPence: number;
};

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

function passErrorResponse(error: unknown) {
  if (error instanceof TemporaryPlayerPassError) {
    const status =
      error.code === "PASS_USED" ||
      error.code === "PASS_REVOKED" ||
      error.code === "ALREADY_IN_SQUAD" ||
      error.code === "ALREADY_ADDED"
        ? 409
        : error.code === "FIXTURE_NOT_FOUND"
          ? 404
          : 400;

    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  console.error("Temporary-player pass redemption failed", error);
  return NextResponse.json(
    { error: "The temporary player could not be added. Please try again." },
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

  const rows = await prisma.$queryRaw<TemporaryPlayerRow[]>`
    SELECT
      pmf."id",
      COALESCE(NULLIF(SPLIT_PART(TRIM(COALESCE(u."name", '')), ' ', 1), ''), 'Player') AS "firstName",
      CASE
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(COALESCE(u."name", '')), '\\s+'), 1) > 1
        THEN UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM(u."name"), '\\s+'))[2], 1))
        ELSE ''
      END AS "surnameInitial",
      pmf."status"::text AS "status",
      pmf."amountPence"
    FROM "PlayerMatchFee" pmf
    JOIN "User" u ON u."id" = pmf."temporaryUserId"
    WHERE pmf."teamId" = ${teamid}
      AND pmf."fixtureId" = ${fixtureId}
      AND pmf."temporaryUserId" IS NOT NULL
      AND pmf."status" <> 'CANCELLED'
    ORDER BY pmf."createdAt" ASC
  `;

  return NextResponse.json({ players: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  const body = (await request.json().catch(() => null)) as
    | { fixtureId?: unknown; passCode?: unknown }
    | null;

  const fixtureId = String(body?.fixtureId ?? "").trim();
  const passCode = String(body?.passCode ?? "").trim();

  if (!fixtureId || !passCode) {
    return NextResponse.json(
      { error: "Enter the one-time pass sent to you by the player." },
      { status: 400 },
    );
  }

  if (!(await fixtureBelongsToTeam(fixtureId, teamid))) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  try {
    const player = await redeemTemporaryPlayerPass({
      code: passCode,
      fixtureId,
      teamId: teamid,
      acceptedByUserId: access.user?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      player: {
        displayName: player.displayName,
        label: "Temporary player",
      },
    });
  } catch (error) {
    return passErrorResponse(error);
  }
}
