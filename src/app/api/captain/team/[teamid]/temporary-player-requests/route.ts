import { NextResponse } from "next/server";

import { publishedFixtureWhere } from "@/lib/fixtures/publishing";
import { queueTemporaryPlayerMatchFeeRequest } from "@/lib/payments/temporary-player-match-fee-requests";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  acceptTemporaryPlayerRequest,
  declineTemporaryPlayerRequest,
  listPendingTemporaryPlayerRequests,
} from "@/lib/temporary-player-requests";
import { TemporaryPlayerPassError } from "@/lib/temporary-player-passes";

function parseAmountPence(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/[£,\s]/g, "")
    .trim();
  if (!cleaned) return null;

  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100) return null;
  return Math.round(amount * 100);
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

function errorResponse(error: unknown) {
  if (error instanceof TemporaryPlayerPassError) {
    const status = error.code === "INVALID_AMOUNT" ? 400 : 409;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  console.error("Temporary-player request action failed.", error);
  return NextResponse.json(
    { error: "The temporary-player request could not be updated." },
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
        amount?: unknown;
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
      const amountPence = parseAmountPence(body?.amount);
      if (amountPence === null) {
        return NextResponse.json(
          {
            error:
              "Enter the temporary player's match fee before accepting. Use £0 if no fee is due.",
          },
          { status: 400 },
        );
      }

      const player = await acceptTemporaryPlayerRequest({
        requestId,
        teamId: teamid,
        fixtureId,
        amountPence,
        acceptedByUserId: access.user?.id ?? null,
      });

      const paymentRequest =
        player.amountPence > 0
          ? await queuePaymentRequestSafely(player.playerMatchFeeId)
          : null;

      return NextResponse.json({
        ok: true,
        decision: "accepted",
        player: {
          displayName: player.displayName,
          amountPence: player.amountPence,
        },
        paymentRequest,
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
