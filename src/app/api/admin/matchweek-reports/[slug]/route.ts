import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { requireAdmin } from "@/lib/requireAdmin";
import { generateReport, getReportView, saveReport } from "@/lib/matchweek-reports/service";
import { ReportError } from "@/lib/matchweek-reports/types";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" };
type Context = { params: Promise<{ slug: string }> };
function failure(error: unknown) {
  if (isRedirectError(error)) return NextResponse.json({ ok: false, error: "Please sign in as an administrator, then return to your report." }, { status: 401, headers });
  if (error instanceof ReportError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers });
  // Never log report content, player/contact data, API keys or raw provider errors.
  console.error("[matchweek-reports] Request outcome unconfirmed", { name: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ ok: false, error: "The outcome could not be confirmed. Your text has been kept. Check saved status before trying again." }, { status: 500, headers });
}
export async function GET(request: NextRequest, context: Context) {
  try {
    const { slug } = await context.params;
    const view = await getReportView(slug, request.nextUrl.searchParams.get("date") || undefined);
    return NextResponse.json({ ok: Boolean(view), view }, { status: view ? 200 : 404, headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    await requireAdmin();
    const allowed = new Set([request.nextUrl.origin]);
    for (const url of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
      try { if (url) allowed.add(new URL(url).origin); } catch { /* Ignore invalid configured origins. */ }
    }
    if (!allowed.has(request.headers.get("origin") || "") || request.headers.get("x-sixfl-report") !== "1" || !request.headers.get("content-type")?.includes("application/json")) throw new ReportError("This request is not allowed. Reload the report page.", 403);
    const text = await request.text();
    if (text.length > 100000) throw new ReportError("The report is too long.", 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { throw new ReportError("The report request could not be read."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ReportError("Invalid request.");
    const { slug } = await context.params;
    const view = body.action === "generate" ? await generateReport(slug, body) : body.action === "save" ? await saveReport(slug, body) : null;
    if (!view) throw new ReportError("Choose Generate report or Save draft.");
    return NextResponse.json({ ok: true, view }, { headers });
  } catch (error) { return failure(error); }
}
