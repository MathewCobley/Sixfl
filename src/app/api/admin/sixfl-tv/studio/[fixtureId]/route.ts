import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { checkFootageOrigin, readFootageJson } from "@/lib/sixfl-tv/footage";
import { FootageError, footageId } from "@/lib/sixfl-tv/footage-policy";
import { cancelRenders, requestRenders, saveThumbnail, StudioError, studioState, type SixflTvRenderKind } from "@/lib/sixfl-tv/studio";
import { queueYoutubePublish, syncPublishedYoutubeThumbnail } from "@/lib/sixfl-tv/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ fixtureId: string }> };
const headers = { "Cache-Control": "private, no-store, max-age=0" };
function failure(error: unknown) {
  if (error instanceof StudioError || error instanceof FootageError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  console.error("SIXFL TV studio operation failed", error instanceof Error ? error.name : "Unknown error");
  return NextResponse.json({ error: "SIXFL TV could not complete that operation. Your source footage has not been changed." }, { status: 503, headers });
}
export async function GET(_: Request, context: Context) {
  await requireAdmin();
  try { return NextResponse.json(await studioState(footageId((await context.params).fixtureId)), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  const { user, session } = await requireAdmin();
  try {
    checkFootageOrigin(request);
    const fixtureId = footageId((await context.params).fixtureId), data = await readFootageJson(request);
    const actor = user?.id || session?.user?.email || "development-admin";
    if (data.action === "render") {
      const kind = data.kind ? String(data.kind) as SixflTvRenderKind : undefined;
      return NextResponse.json(
        await requestRenders(fixtureId, actor, kind, {
          autoPublish: data.autoPublish !== false,
        }),
        { status: 202, headers },
      );
    }
    if (data.action === "cancel-render") {
      const kind = data.kind ? String(data.kind) as SixflTvRenderKind : undefined;
      return NextResponse.json(await cancelRenders(fixtureId, actor, kind), { headers });
    }
    if (data.action === "thumbnail") {
      const kind = String(data.kind || "") as SixflTvRenderKind;
      const saved = await saveThumbnail(fixtureId, kind, actor, data);
      const youtube = await syncPublishedYoutubeThumbnail(fixtureId, kind);
      return NextResponse.json({ ...saved, youtubeThumbnailSynced: youtube.synced }, { headers });
    }
    if (data.action === "publish") {
      if (data.confirmed !== true) throw new StudioError("Confirm that you have reviewed this video and thumbnail before uploading it to YouTube.", 409);
      const kind = String(data.kind || "") as SixflTvRenderKind;
      // The live thumbnail preview can change when a fresh action frame is chosen or
      // when the admin edits the fields. Re-save those exact values immediately before
      // queuing YouTube so the thumbnail on YouTube is guaranteed to match the preview.
      await saveThumbnail(fixtureId, kind, actor, data);
      return NextResponse.json(await queueYoutubePublish(fixtureId, kind, actor, data), { status: 202, headers });
    }
    throw new StudioError("Unknown SIXFL TV studio action.");
  } catch (error) { return failure(error); }
}
