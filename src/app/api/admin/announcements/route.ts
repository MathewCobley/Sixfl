import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { requireAdmin } from "@/lib/requireAdmin";
import { AnnouncementReviewError, queueSystemAnnouncement, readAnnouncementStatus, type AnnouncementReview } from "@/lib/communications/announcement-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (isRedirectError(error)) return NextResponse.json({ ok: false, error: "Please sign in as an administrator, then check progress before trying again." }, { status: 401, headers });
  const known = error instanceof AnnouncementReviewError;
  return NextResponse.json({ ok: false, error: known ? error.message : "The result could not be confirmed. Check progress before trying again; emails may already be queued." }, { status: known ? 409 : 500, headers });
}
function parseReview(data: Record<string, unknown>): AnnouncementReview {
  return { templateId: String(data.templateId ?? ""), sourceId: String(data.sourceId ?? ""), audienceKey: String(data.audienceKey ?? "") };
}
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const review = parseReview(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json({ ok: true, ...await readAnnouncementStatus(review) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdmin();
    if (!user?.id) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403, headers });
    const origin = request.headers.get("origin");
    const hosts = [request.nextUrl.host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
    let sameOrigin = false;
    try { sameOrigin = Boolean(origin && hosts.includes(new URL(origin).host)); } catch { /* Deny malformed origins. */ }
    if (!sameOrigin || request.headers.get("x-sixfl-announcement") !== "1" || !request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "This request is not allowed." }, { status: 403, headers });
    }
    const data: unknown = await request.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new AnnouncementReviewError("Refresh the announcement and review it before queueing.");
    const payload = data as Record<string, unknown>;
    const result = await queueSystemAnnouncement({ ...parseReview(payload), confirmed: payload.confirmed === true, actorUserId: user.id });
    return NextResponse.json({ ok: true, ...result }, { headers });
  } catch (error) { return failure(error); }
}
