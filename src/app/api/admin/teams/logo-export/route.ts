import { requireAdmin } from "@/lib/requireAdmin";
import { buildTeamLogoExport } from "@/lib/exports/team-logos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
let activeExports = 0;
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: noStore });
}
async function readSelection(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json") || !request.body) throw new Error("Select teams using the logo download page.");
  if (Number(request.headers.get("content-length") ?? 0) > 32768) throw new Error("Select fewer teams.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) { await reader.cancel(); throw new Error("Select fewer teams."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8"))?.teamIds; }
  catch { throw new Error("Select teams using the logo download page."); }
}
export async function POST(request: Request) {
  try { await requireAdmin(); } catch { return fail("Please sign in as an administrator, then try again.",401); }
  const hosts = [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()];
  let validOrigin = false;
  try { validOrigin = hosts.includes(new URL(request.headers.get("origin") ?? "").host); } catch { /* deny */ }
  if (!validOrigin || request.headers.get("x-sixfl-logo-export") !== "1") return fail("This export request is not allowed.",403);
  if (activeExports >= 2) return fail("Another logo export is being prepared. Please try again shortly.",429);
  activeExports++;
  try {
    const result = await buildTeamLogoExport(await readSelection(request), request.signal);
    return new Response(new Uint8Array(result.data), { headers: {
      ...noStore, "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="SIXFL-Team-Logos-${new Date().toISOString().slice(0,10)}.zip"`,
      "Content-Length": String(result.data.length),
      "X-SIXFL-Logos-Exported": String(result.exported),
      "X-SIXFL-Logos-Missing": String(result.missing),
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Select |A selected |The logo pack |None of )/.test(message)) return fail(message,422);
    return fail("The logo pack could not be prepared. Your selection is unchanged; please try again.",500);
  } finally { activeExports--; }
}
