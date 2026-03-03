import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getUserSideForMatch } from "@/lib/authz";

export const runtime = "nodejs";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function conflict(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 409 });
}

export async function POST(
  req: Request,
  { params }: { params: { matchId: string } }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const matchId = params.matchId;
  if (!matchId) return badRequest("Missing matchId");

  const side = await getUserSideForMatch({ matchId, userId });
  if (!side) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const reason = String(body?.reason ?? "").trim();
  if (reason.length < 5) return badRequest("Please provide a short dispute reason");

  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.matchResult.findUnique({
        where: { matchId },
        select: {
          id: true,
          status: true,
          submittedHome: true,
          submittedAway: true,
          homeResponse: true,
          awayResponse: true,
        },
      });

      if (!current) throw new Error("RESULT_NOT_FOUND");

      if (current.status === "DRAFT") throw new Error("NOT_SUBMITTED");
      if (current.status === "VOID") throw new Error("VOID");
      if (current.status === "RESOLVED") throw new Error("RESOLVED");
      if (current.status === "CONFIRMED") throw new Error("ALREADY_CONFIRMED");

      if (current.submittedHome == null || current.submittedAway == null) {
        throw new Error("NO_SUBMITTED_SCORE");
      }

      const isHome = side === "HOME";

      const updated = await tx.matchResult.update({
        where: { matchId },
        data: {
          status: "DISPUTED",
          disputeReason: reason,
          confirmBy: null,
          ...(isHome
            ? { homeResponse: "DISPUTED", homeRespondedAt: now }
            : { awayResponse: "DISPUTED", awayRespondedAt: now }),
        },
        select: {
          matchId: true,
          status: true,
          homeResponse: true,
          awayResponse: true,
          disputeReason: true,
          updatedAt: true,
        },
      });

      await tx.resultEvent.create({
        data: {
          resultId: current.id,
          type: "CAPTAIN_DISPUTE",
          actorUserId: userId,
          note: `${side} disputed`,
          payloadJson: { reason },
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    const msg = e?.message ?? "UNKNOWN";
    if (msg === "RESULT_NOT_FOUND") return NextResponse.json({ ok: false, error: "Result not found" }, { status: 404 });
    if (msg === "NOT_SUBMITTED") return conflict("Result not submitted yet");
    if (msg === "NO_SUBMITTED_SCORE") return conflict("No submitted score to dispute");
    if (msg === "ALREADY_CONFIRMED") return conflict("Result already confirmed");
    if (msg === "VOID") return conflict("Result is void");
    if (msg === "RESOLVED") return conflict("Result is resolved");
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}