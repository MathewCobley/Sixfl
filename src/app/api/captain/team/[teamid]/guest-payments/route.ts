import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireCaptain } from "@/lib/requireCaptain";
import { prisma } from "@/lib/prisma";
import { assertGuestApprovalAccess, assertGuestApprovalOrigin, GuestApprovalError } from "@/lib/fixtures/guest-approval-policy";
import { assertGuestPaymentAccess, canManageGuestPayments, guestPaymentId, readGuestPayment } from "@/lib/fixtures/guest-payment-policy";
import { getGuestPaymentState, prepareGuestPayment } from "@/lib/fixtures/guest-payments";
import { buildPlayerMatchFeePaymentUrl } from "@/lib/payments/player-match-fees";
import { queueTemporaryPlayerMatchFeeRequest } from "@/lib/payments/temporary-player-match-fee-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ teamid: string }> };
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof GuestApprovalError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("Approved guest payment failed", error);
  return NextResponse.json({ error: "The payment change could not be confirmed. Reload this guest before retrying; do not create another player." }, { status: 500, headers });
}

export async function GET(request: Request, { params }: Context) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  try {
    assertGuestApprovalAccess(access);
    const url = new URL(request.url);
    const state = await getGuestPaymentState({ teamId: teamid,
      fixtureId: guestPaymentId(url.searchParams.get("fixtureId")),
      approvalId: guestPaymentId(url.searchParams.get("approvalId")) });
    const delivery = state.fee ? await prisma.notificationDispatch.findFirst({
      where: { sourceType: "PLAYER_MATCH_FEE_REQUEST", sourceId: state.fee.id, channel: "EMAIL" },
      orderBy: { createdAt: "desc" }, select: { status: true, sentAt: true, createdAt: true },
    }) : null;
    return NextResponse.json({ ...state, canManage: canManageGuestPayments(access), delivery }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Context) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  try {
    assertGuestPaymentAccess(access);
    assertGuestApprovalOrigin(request);
    const input = await readGuestPayment(request);
    const result = await prepareGuestPayment({ ...input, teamId: teamid, actorUserId: access.user!.id }, buildPlayerMatchFeePaymentUrl);
    // Money is committed first. Queue failure must not encourage creating a second fee.
    let paymentRequest: { status: string; queued?: number; skipped?: number } = { status: result.status === "PAID" ? "paid" : "no_fee" };
    if (result.status === "OPEN" && result.amountPence > 0) {
      try { paymentRequest = await queueTemporaryPlayerMatchFeeRequest(result.feeId); }
      catch (error) {
        console.error("Guest fee saved but email queue failed", { feeId: result.feeId, error });
        paymentRequest = { status: "failed", queued: 0 };
      }
    }
    revalidatePath(`/captain/team/${teamid}/match-fees`);
    revalidatePath(`/captain/team/${teamid}/player-payments`);
    return NextResponse.json({ ok: true, ...result, paymentRequest }, { headers });
  } catch (error) { return failure(error); }
}
