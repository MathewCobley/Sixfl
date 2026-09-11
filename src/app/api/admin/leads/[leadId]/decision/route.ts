import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/requireAdmin";
import { declineTeamPlaceFromLead } from "@/lib/leads/teamPlaceConfirmation";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  try {
    const { user } = await requireAdmin();
    if (!user?.id) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
    const origin = request.headers.get("origin");
    const hosts = [request.nextUrl.host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
    let sameOrigin = false;
    try { sameOrigin = Boolean(origin && hosts.includes(new URL(origin).host)); } catch { /* Reject malformed origin. */ }
    if (!sameOrigin || request.headers.get("x-sixfl-lead-decision") !== "1") {
      return NextResponse.json({ ok: false, error: "This request is not allowed." }, { status: 403 });
    }
    const { leadId } = await context.params;
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid decision.");
    const data = payload as Record<string, unknown>;
    if (data.decision !== "DECLINED" || typeof data.via !== "string" || !["SMS", "EMAIL", "PHONE", "IN_PERSON", "OTHER"].includes(data.via)) {
      throw new Error("Choose how they told you they were not interested.");
    }
    if (typeof data.note !== "string" || data.note.length > 2000) throw new Error("Please keep the reason to 2,000 characters or fewer.");
    const result = await declineTeamPlaceFromLead(leadId, {
      actorUserId: user.id, actorLabel: user.name || user.email || "Administrator", via: data.via, note: data.note,
    });
    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${leadId}`, "layout");
    revalidatePath("/admin/messaging");
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRedirectError(error)) return NextResponse.json({ ok: false, error: "Please sign in as an administrator." }, { status: 401 });
    // Do not expose database/provider details in responses or logs.
    const message = error instanceof Error ? error.message : "";
    const allowed = ["Lead not found.", "This action is for team enquiries only.", "This enquiry has already become a team. Manage that team's participation instead.", "Choose how they told you they were not interested.", "Please keep the reason to 2,000 characters or fewer.", "Invalid decision."];
    return NextResponse.json({ ok: false, error: allowed.includes(message) ? message : "The decision could not be confirmed. Refresh the lead to check its status before retrying." }, { status: allowed.includes(message) ? 400 : 500 });
  }
}
