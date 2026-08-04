import { NextResponse } from "next/server";

import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

type TemporaryPlayerRow = {
  id: string;
  firstName: string;
  surnameInitial: string;
  status: string;
  amountPence: number;
};

function normaliseCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function normaliseFirstName(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("en-GB");
}

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
  await requireCaptain(teamid);

  const body = (await request.json().catch(() => null)) as
    | { fixtureId?: unknown; firstName?: unknown; playerCode?: unknown }
    | null;

  const fixtureId = String(body?.fixtureId ?? "").trim();
  const firstName = normaliseFirstName(body?.firstName);
  const playerCode = normaliseCode(body?.playerCode);

  if (!fixtureId || !firstName || !/^SIX-[A-Z0-9]{8}$/.test(playerCode)) {
    return NextResponse.json(
      { error: "We couldn't find a player matching those details." },
      { status: 400 },
    );
  }

  if (!(await fixtureBelongsToTeam(fixtureId, teamid))) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  const matches = await prisma.$queryRaw<
    { id: string; firstName: string; surnameInitial: string }[]
  >`
    SELECT
      "id",
      SPLIT_PART(TRIM("name"), ' ', 1) AS "firstName",
      CASE
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM("name"), '\\s+'), 1) > 1
        THEN UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM("name"), '\\s+'))[2], 1))
        ELSE ''
      END AS "surnameInitial"
    FROM "User"
    WHERE "playerCode" = ${playerCode}
      AND LOWER(SPLIT_PART(TRIM(COALESCE("name", '')), ' ', 1)) = ${firstName}
    LIMIT 1
  `;

  const player = matches[0];
  if (!player) {
    return NextResponse.json(
      { error: "We couldn't find a player matching those details." },
      { status: 404 },
    );
  }

  const permanentMember = await prisma.teamMember.findFirst({
    where: { teamId: teamid, userId: player.id },
    select: { id: true },
  });

  if (permanentMember) {
    return NextResponse.json(
      { error: "That player is already in this team's squad." },
      { status: 409 },
    );
  }

  try {
    await prisma.$executeRaw`
      INSERT INTO "PlayerMatchFee" (
        "id", "fixtureId", "teamId", "temporaryUserId", "amountPence",
        "status", "note", "createdAt", "updatedAt"
      )
      VALUES (
        CONCAT('tmp_', REPLACE(gen_random_uuid()::text, '-', '')),
        ${fixtureId}, ${teamid}, ${player.id}, 600,
        'OPEN'::"PlayerMatchFeeStatus", 'Temporary player added by captain', NOW(), NOW()
      )
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("PlayerMatchFee_fixtureId_temporaryUserId_key")) {
      return NextResponse.json(
        { error: "That player is already added to this fixture." },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({
    ok: true,
    player: {
      displayName: `${player.firstName}${player.surnameInitial ? ` ${player.surnameInitial}.` : ""}`,
      label: "Temporary player",
    },
  });
}
