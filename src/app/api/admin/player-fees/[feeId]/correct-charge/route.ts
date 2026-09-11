import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { confirmOriginalPlayerCharge, previewOriginalPlayerCharge, PlayerChargeCorrectionError } from "@/lib/payments/player-charge-correction";
import { parseLedgerMoney } from "@/lib/payments/player-ledger";

export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ feeId: string }> }) {
  // Match the configured public origin as well as Request.url: behind Railway
  // the latter can contain the internal HTTP host. Never trust submitted host flags.
  const origins = [new URL(request.url).origin];
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (value) { try { origins.push(new URL(value).origin); } catch { /* Ignore invalid deployment settings. */ } }
  }
  if (!origins.includes(request.headers.get("origin") ?? "") || request.headers.get("sec-fetch-site") === "cross-site"
    || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Same-origin JSON request required." }, { status: 403 });
  }
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } }) : null;
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  const { feeId } = await params;
  try {
    const raw = await request.text();
    if (raw.length > 15000) throw new PlayerChargeCorrectionError("Request is too large.");
    const body = JSON.parse(raw);
    if (body.action === "preview") {
      const preview = await previewOriginalPlayerCharge({ feeId, actorUserId: user.id,
        originalPence: parseLedgerMoney(body.originalAmount), reason: String(body.reason ?? ""),
        resolution: body.resolution === "adjustment" ? "adjustment" : "outstanding",
        noWaiver: body.noWaiver === true, adjustmentConfirmed: body.adjustmentConfirmed === true });
      return NextResponse.json({ preview }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "confirm" || body.confirmed !== true || typeof body.token !== "string") throw new PlayerChargeCorrectionError("Preview and explicitly confirm the correction first.");
    const result = await confirmOriginalPlayerCharge({ feeId, actorUserId: user.id, token: body.token });
    for (const path of ["/admin/payments", `/admin/payments/player-fees/${feeId}/correct-charge`,
      `/captain/team/${result.teamId}/payments`, `/captain/team/${result.teamId}/player-payments`,
      `/captain/team/${result.teamId}/player-payments/accounts`, `/captain/team/${result.teamId}/player-payments/account/${feeId}`,
      `/player/team/${result.teamId}`, `/player/team/${result.teamId}/ledger`]) revalidatePath(path);
    return NextResponse.json({ saved: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PlayerChargeCorrectionError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[player-charge-correction] Request failed", error);
    return NextResponse.json({ error: "The correction could not be completed. Check the player account before retrying. No payment or message was requested." }, { status: 400 });
  }
}
