import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { queueAdminSmsReply, readAdminSmsReply, readRecentAdminSmsReplies, SmsReplyError } from "@/lib/messaging/admin-sms-reply";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (isRedirectError(error)) return NextResponse.json({ ok: false, uncertain: false, error: "Please sign in as an administrator, then return to your saved draft." }, { status: 401, headers });
  if (error instanceof SmsReplyError) return NextResponse.json({ ok: false, uncertain: false, error: error.message }, { status: error.status, headers });
  // A lost response/commit acknowledgement is not proof of failure. Never retry
  // automatically and never expose message bodies or credentials in diagnostics.
  console.error("[admin-sms-reply] Request outcome needs checking", { name: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ ok: false, uncertain: true, error: "The reply outcome could not be confirmed. Your draft is kept. Check status before retrying." }, { status: 500, headers });
}
export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("recent") === "1") {
      const records = await readRecentAdminSmsReplies(request.nextUrl.searchParams.get("threadId") || "");
      return NextResponse.json({ ok: true, records }, { headers });
    }
    const record = await readAdminSmsReply({ threadId: request.nextUrl.searchParams.get("threadId") || "", requestId: request.nextUrl.searchParams.get("requestId") || "" });
    return NextResponse.json({ ok: true, record }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const hosts = [request.nextUrl.host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
    let sameOrigin = false;
    try { const origin = new URL(request.headers.get("origin") || ""); sameOrigin = ["https:", "http:"].includes(origin.protocol) && hosts.includes(origin.host); } catch { /* Deny malformed origin. */ }
    if (!sameOrigin || request.headers.get("x-sixfl-sms-reply") !== "1" || !request.headers.get("content-type")?.includes("application/json")) throw new SmsReplyError("This request is not allowed. Refresh the conversation before sending.", 403);
    const text = await request.text();
    if (text.length > 10000) throw new SmsReplyError("This reply is too long.", 400);
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new SmsReplyError("The reply could not be read. Your draft has been kept.", 400); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SmsReplyError("Invalid reply request.", 400);
    const data = value as Record<string, unknown>;
    for (const key of ["threadId", "requestId", "body", "expectedPhone"]) if (typeof data[key] !== "string") throw new SmsReplyError("The reply is missing required details. Refresh the conversation.", 400);
    // The shared service authenticates and obtains the actor from the session.
    // An actor identifier supplied by the browser is never trusted.
    const record = await queueAdminSmsReply({ threadId: data.threadId as string, requestId: data.requestId as string, body: data.body as string, expectedPhone: data.expectedPhone as string });
    return NextResponse.json({ ok: true, record }, { headers });
  } catch (error) { return failure(error); }
}
