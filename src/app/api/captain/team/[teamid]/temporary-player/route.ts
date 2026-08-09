import { NextResponse } from "next/server";

import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { cancelQueuedPlayerMatchFeeNotificationDispatches } from "@/lib/payments/cancel-player-match-fee-notifications";
import { ensurePlayerMatchFeePaymentDetails } from "@/lib/payments/player-match-fees";
import { queueTemporaryPlayerMatchFeeRequest } from "@/lib/payments/temporary-player-match-fee-requests";
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
  email: string | null;
  status: string;
  amountPence: number;
};

type EditableTemporaryPlayerRow = TemporaryPlayerRow & {
  userId: string;
};

function parseAmountPence(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/[£,\s]/g, "")
    .trim();
  if (!cleaned) return null;

  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100) return null;
  return Math.round(amount * 100);
}

function displayName(player: Pick<TemporaryPlayerRow, "firstName" | "surnameInitial">) {
  return `${player.firstName}${player.surnameInitial ? ` ${player.surnameInitial}.` : ""}`;
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

function passErrorResponse(error: unknown) {
  if (error instanceof TemporaryPlayerPassError) {
    const status =
      error.code === "INVALID_AMOUNT"
        ? 400
        : error.code === "PASS_USED" ||
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

async function queuePaymentRequestSafely(feeId: string) {
  try {
    return await queueTemporaryPlayerMatchFeeRequest(feeId);
  } catch (error) {
    console.error("Temporary-player payment request could not be queued", {
      feeId,
      error,
    });
    return { queued: 0, skipped: 1, status: "failed" as const };
  }
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
      u."email",
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
    | { fixtureId?: unknown; passCode?: unknown; amount?: unknown }
    | null;

  const fixtureId = String(body?.fixtureId ?? "").trim();
  const passCode = String(body?.passCode ?? "").trim();
  const amountPence = parseAmountPence(body?.amount);

  if (!fixtureId || !passCode) {
    return NextResponse.json(
      { error: "Enter the one-time pass sent to you by the player." },
      { status: 400 },
    );
  }

  if (amountPence === null) {
    return NextResponse.json(
      {
        error:
          "Enter the temporary player's match fee before linking them. Use £0 if no fee is due.",
      },
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
      amountPence,
      acceptedByUserId: access.user?.id ?? null,
    });

    const paymentRequest =
      player.amountPence > 0
        ? await queuePaymentRequestSafely(player.playerMatchFeeId)
        : null;

    return NextResponse.json({
      ok: true,
      player: {
        displayName: player.displayName,
        label: "Temporary player",
        amountPence: player.amountPence,
      },
      paymentRequest,
    });
  } catch (error) {
    return passErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamid: string }> },
) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const body = (await request.json().catch(() => null)) as
    | { fixtureId?: unknown; feeId?: unknown; amount?: unknown }
    | null;

  const fixtureId = String(body?.fixtureId ?? "").trim();
  const feeId = String(body?.feeId ?? "").trim();
  const amountPence = parseAmountPence(body?.amount);

  if (!fixtureId || !feeId) {
    return NextResponse.json(
      { error: "Choose the temporary player and fixture first." },
      { status: 400 },
    );
  }

  if (amountPence === null) {
    return NextResponse.json(
      { error: "Enter a match fee between £0 and £100." },
      { status: 400 },
    );
  }

  if (!(await fixtureBelongsToTeam(fixtureId, teamid))) {
    return NextResponse.json({ error: "Fixture not found" }, { status: 404 });
  }

  const rows = await prisma.$queryRaw<EditableTemporaryPlayerRow[]>`
    SELECT
      pmf."id",
      pmf."temporaryUserId" AS "userId",
      COALESCE(NULLIF(SPLIT_PART(TRIM(COALESCE(u."name", '')), ' ', 1), ''), 'Player') AS "firstName",
      CASE
        WHEN ARRAY_LENGTH(REGEXP_SPLIT_TO_ARRAY(TRIM(COALESCE(u."name", '')), '\\s+'), 1) > 1
        THEN UPPER(LEFT((REGEXP_SPLIT_TO_ARRAY(TRIM(u."name"), '\\s+'))[2], 1))
        ELSE ''
      END AS "surnameInitial",
      u."email",
      pmf."status"::text AS "status",
      pmf."amountPence"
    FROM "PlayerMatchFee" pmf
    JOIN "User" u ON u."id" = pmf."temporaryUserId"
    WHERE pmf."id" = ${feeId}
      AND pmf."teamId" = ${teamid}
      AND pmf."fixtureId" = ${fixtureId}
      AND pmf."temporaryUserId" IS NOT NULL
    LIMIT 1
  `;

  const player = rows[0] ?? null;
  if (!player) {
    return NextResponse.json(
      { error: "That temporary-player fee could not be found." },
      { status: 404 },
    );
  }

  if (player.status === "PAID" || player.status === "CANCELLED") {
    return NextResponse.json(
      {
        error:
          player.status === "PAID"
            ? "A paid temporary-player fee is locked. SIXFL admin must reconcile it before changing the amount."
            : "A cancelled temporary-player fee cannot be reopened here.",
      },
      { status: 409 },
    );
  }

  await cancelQueuedPlayerMatchFeeNotificationDispatches(
    [feeId],
    "Temporary-player match fee changed by the team.",
  );

  const note =
    amountPence === 0
      ? "Temporary-player match fee updated by the team: no fee due."
      : `Temporary-player match fee updated by the team to £${(
          amountPence / 100
        ).toFixed(2)}.`;

  let paymentRequest: Awaited<ReturnType<typeof queuePaymentRequestSafely>> | null = null;

  if (amountPence === 0) {
    await prisma.$executeRaw`
      UPDATE "PlayerMatchFee"
      SET
        "amountPence" = 0,
        "status" = 'WAIVED'::"PlayerMatchFeeStatus",
        "paidAt" = NULL,
        "waivedAt" = NOW(),
        "cancelledAt" = NULL,
        "paymentUrl" = NULL,
        "paymentToken" = NULL,
        "note" = CASE
          WHEN TRIM(COALESCE("note", '')) = '' THEN ${note}
          ELSE "note" || E'\n' || ${note}
        END,
        "updatedAt" = NOW()
      WHERE "id" = ${feeId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "PlayerMatchFee"
      SET
        "amountPence" = ${amountPence},
        "status" = 'OPEN'::"PlayerMatchFeeStatus",
        "paidAt" = NULL,
        "waivedAt" = NULL,
        "cancelledAt" = NULL,
        "note" = CASE
          WHEN TRIM(COALESCE("note", '')) = '' THEN ${note}
          ELSE "note" || E'\n' || ${note}
        END,
        "updatedAt" = NOW()
      WHERE "id" = ${feeId}
    `;

    await ensurePlayerMatchFeePaymentDetails(feeId);
    paymentRequest = await queuePaymentRequestSafely(feeId);
  }

  return NextResponse.json({
    ok: true,
    player: {
      id: player.id,
      displayName: displayName(player),
      label: "Temporary player",
      amountPence,
      status: amountPence === 0 ? "WAIVED" : "OPEN",
    },
    paymentRequest,
  });
}
