import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  correctCaptainAssignedShare,
  PlayerAssignedShareCorrectionError,
} from "@/lib/payments/player-assigned-share-correction";
import { parseLedgerMoney } from "@/lib/payments/player-ledger";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feeId: string }> },
) {
  const origins = [new URL(request.url).origin];
  for (const value of [
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    if (!value) continue;
    try {
      origins.push(new URL(value).origin);
    } catch {
      // Ignore invalid optional deployment settings.
    }
  }

  if (
    !origins.includes(request.headers.get("origin") ?? "") ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return NextResponse.json(
      { error: "Same-origin JSON request required." },
      { status: 403 },
    );
  }

  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      })
    : null;

  if (!user || user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Administrator access is required." },
      { status: 403 },
    );
  }

  const { feeId } = await params;

  try {
    const raw = await request.text();
    if (raw.length > 8000) {
      throw new PlayerAssignedShareCorrectionError("Request is too large.");
    }

    const body = JSON.parse(raw);
    const result = await correctCaptainAssignedShare({
      feeId,
      actorUserId: user.id,
      assignedPence: parseLedgerMoney(body.assignedAmount),
      expectedAssignedPence: Number(body.expectedAssignedPence),
      confirmed: body.confirmed === true,
    });

    for (const path of [
      "/admin/payments",
      `/admin/payments/player-fees/${feeId}/correct-charge`,
      `/captain/team/${result.teamId}/payments`,
      `/captain/team/${result.teamId}/player-payments`,
      `/captain/team/${result.teamId}/player-payments/accounts`,
      `/captain/team/${result.teamId}/player-payments/account/${feeId}`,
      `/player/team/${result.teamId}`,
      `/player/team/${result.teamId}/ledger`,
    ]) {
      revalidatePath(path);
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PlayerAssignedShareCorrectionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("[player-assigned-share-correction] Request failed", error);
    return NextResponse.json(
      {
        error:
          "The captain share could not be changed. Reload the player account before retrying. No payment or message was requested.",
      },
      { status: 400 },
    );
  }
}
