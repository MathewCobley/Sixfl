import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { FootageError, footageId } from "@/lib/sixfl-tv/footage-policy";
import { beginFootage, checkFootageOrigin, finishFootage, footageFixture, footageState, putFootagePart, readFootageBytes, readFootageJson, removeFootage, reorderFootage, resumeFootage } from "@/lib/sixfl-tv/footage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ fixtureId: string }> };
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (error instanceof FootageError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  // Storage/DB exceptions can contain infrastructure details: never echo them.
  console.error("SIXFL private footage operation failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "The footage could not be saved. Your completed parts are retained. Try resuming in two minutes; if it continues, check video storage." }, { status: 503, headers });
}
export async function GET(request: Request, context: Context) {
  await requireAdmin();
  try {
    const fixtureId = footageId((await context.params).fixtureId);
    await footageFixture(fixtureId);
    const assetId = new URL(request.url).searchParams.get("assetId");
    return NextResponse.json(assetId ? await resumeFootage(fixtureId, footageId(assetId)) : await footageState(fixtureId), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const { user, session } = await requireAdmin();
  try {
    checkFootageOrigin(request);
    const fixtureId = footageId((await context.params).fixtureId), data = await readFootageJson(request);
    await footageFixture(fixtureId);
    const actor = user?.id || session?.user?.email || "development-admin";
    switch (data.action) {
      case "begin": return NextResponse.json(await beginFootage(fixtureId, actor, data), { status: 201, headers });
      case "finish": await finishFootage(fixtureId, footageId(data.assetId)); break;
      case "reorder": await reorderFootage(fixtureId, data.ids, data.expectedIds); break;
      case "remove": return NextResponse.json(await removeFootage(fixtureId, footageId(data.assetId), data.confirmed), { headers });
      default: throw new FootageError("Unknown footage action.");
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return failure(error); }
}
export async function PUT(request: Request, context: Context) {
  await requireAdmin();
  try {
    checkFootageOrigin(request);
    if (request.headers.get("content-type") !== "application/octet-stream") throw new FootageError("Use the footage uploader to send this file.");
    const fixtureId = footageId((await context.params).fixtureId), url = new URL(request.url);
    const part = url.searchParams.get("part");
    if (!part || !/^\d{1,4}$/.test(part)) throw new FootageError("Invalid upload part.");
    const assetId = footageId(url.searchParams.get("assetId"));
    const bytes = await readFootageBytes(request);
    return NextResponse.json(await putFootagePart(fixtureId, assetId, Number(part), bytes), { headers });
  } catch (error) { return failure(error); }
}
