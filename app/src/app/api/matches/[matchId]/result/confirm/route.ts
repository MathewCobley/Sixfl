import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { getUserSideForMatch } from "@/lib/authz";

export const runtime = "nodejs";

function conflict(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 409 });
}

export async function POST(
  _req: Request,
  { params }: { params: { matchId: string } }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const matchId = params.matchId;
  if (!matchId) return NextResponse.json({ ok: false, error: "Missing matchId" }, { status: 400 });

  const side = await getUserSideForMatch({ matchId, userId });
  if (!side) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

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

      // once disputed, don't allow confirmation until admin resolution
      if (current.status === "DISPUTED" || current.homeResponse === "DISPUTED" || current.awayResponse === "DISPUTED") {
        throw new Error("DISPUTED");
      }

      if (current.submittedHome == null || current.submittedAway == null) {
        throw new Error("NO_SUBMITTED_SCORE");
      }

      const isHome = side === "HOME";

      // idempotent: already confirmed by this side
      const alreadyConfirmed =
        (isHome && current.homeResponse === "CONFIRMED") ||
        (!isHome && current.awayResponse === "CONFIRMED");

      if (alreadyConfirmed) {
        await tx.resultEvent.create({
          data: {
            resultId: current.id,
            type: "CAPTAIN_CONFIRM_IDEMPOTENT",
            actorUserId: userId,
            note: `${side} already confirmed`,
          },
        });

        return tx.matchResult.findUnique({
          where: { matchId },
          select: {
            matchId: true,
            status: true,
            homeResponse: true,
            awayResponse: true,
            finalHome: true,
            finalAway: true,
            updatedAt: true,
          },
        });
      }

      const updated = await tx.matchResult.update({
        where: { matchId },
        data: isHome
          ? { homeResponse: "CONFIRMED", homeRespondedAt: now }
          : { awayResponse: "CONFIRMED", awayRespondedAt: now },
        select: {
          id: true,
          matchId: true,
          status: true,
          submittedHome: true,
          submittedAway: true,
          homeResponse: true,
          awayResponse: true,
        },
      });

      // if both confirmed -> finalize
      const bothConfirmed = updated.homeResponse === "CONFIRMED" && updated.awayResponse === "CONFIRMED";

      if (bothConfirmed) {
        const finalized = await tx.matchResult.update({
          where: { matchId },
          data: {
            status: "CONFIRMED",
            finalHome: updated.submittedHome!,
            finalAway: updated.submittedAway!,
            lockedAt: now,
            lockedById: userId, // optional attribution
            confirmBy: null,
          },
          select: {
            matchId: true,
            status: true,
            homeResponse: true,
            awayResponse: true,
            finalHome: true,
            finalAway: true,
            lockedAt: true,
            updatedAt: true,
          },
        });

        await tx.resultEvent.create({
          data: {
            resultId: updated.id,
            type: "CAPTAIN_CONFIRM_AND_FINALIZE",
            actorUserId: userId,
            note: `${side} confirmed (both confirmed)`,
            payloadJson: { finalHome: finalized.finalHome, finalAway: finalized.finalAway },
          },
        });

        return finalized;
      }

      await tx.resultEvent.create({
        data: {
          resultId: updated.id,
          type: "CAPTAIN_CONFIRM",
          actorUserId: userId,
          note: `${side} confirmed`,
        },
      });

      return tx.matchResult.findUnique({
        where: { matchId },
        select: {
          matchId: true,
          status: true,
          homeResponse: true,
          awayResponse: true,
          confirmBy: true,
          updatedAt: true,
        },
      });
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    const msg = e?.message ?? "UNKNOWN";
    if (msg === "RESULT_NOT_FOUND") return NextResponse.json({ ok: false, error: "Result not found" }, { status: 404 });
    if (msg === "NOT_SUBMITTED") return conflict("Result not submitted yet");
    if (msg === "NO_SUBMITTED_SCORE") return conflict("No submitted score to confirm");
    if (msg === "DISPUTED") return conflict("Result is disputed");
    if (msg === "VOID") return conflict("Result is void");
    if (msg === "RESOLVED") return conflict("Result is resolved");
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}