import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

export async function POST(
  req: Request,
  { params }: { params: { matchId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const matchId = params.matchId;
  if (!matchId) return badRequest("Missing matchId");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const { home, away } = body as { home?: unknown; away?: unknown };

  const homeScore = Number(home);
  const awayScore = Number(away);

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return badRequest("Scores must be whole numbers");
  }
  if (homeScore < 0 || awayScore < 0) {
    return badRequest("Scores cannot be negative");
  }
  if (homeScore > 99 || awayScore > 99) {
    return badRequest("Scores look too high (max 99)");
  }

  // Ensure match exists
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true },
  });

  if (!match) {
    return NextResponse.json({ ok: false, error: "Match not found" }, { status: 404 });
  }

  const now = new Date();
  const confirmBy = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

  const result = await prisma.matchResult.upsert({
    where: { matchId },
    create: {
      matchId,
      status: "SUBMITTED",
      submittedHome: homeScore,
      submittedAway: awayScore,
      submittedById: session.user.id,
      submittedAt: now,
      homeResponse: "PENDING",
      awayResponse: "PENDING",
      confirmBy,
      events: {
        create: {
          type: "SUBMIT",
          actorUserId: session.user.id,
          payloadJson: { home: homeScore, away: awayScore },
        },
      },
    },
    update: {
      status: "SUBMITTED",
      submittedHome: homeScore,
      submittedAway: awayScore,
      submittedById: session.user.id,
      submittedAt: now,
      homeResponse: "PENDING",
      awayResponse: "PENDING",
      homeRespondedAt: null,
      awayRespondedAt: null,
      disputeReason: null,
      finalHome: null,
      finalAway: null,
      lockedAt: null,
      lockedById: null,
      confirmBy,
      events: {
        create: {
          type: "RESUBMIT",
          actorUserId: session.user.id,
          payloadJson: { home: homeScore, away: awayScore },
        },
      },
    },
    select: {
      matchId: true,
      status: true,
      submittedHome: true,
      submittedAway: true,
      submittedAt: true,
      confirmBy: true,
    },
  });

  return NextResponse.json({ ok: true, result });
}