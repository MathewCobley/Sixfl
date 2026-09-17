import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { footageId } from "@/lib/sixfl-tv/footage-policy";
import { StudioError, studioFixture } from "@/lib/sixfl-tv/studio";
import { youtubeAuthorisationUrl } from "@/lib/sixfl-tv/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  await requireAdmin();
  try {
    const fixtureId = footageId(new URL(request.url).searchParams.get("fixtureId"));
    await studioFixture(fixtureId);
    return NextResponse.redirect(youtubeAuthorisationUrl(fixtureId), 302);
  } catch (error) {
    const message = error instanceof StudioError ? error.message : "YouTube connection could not be started.";
    return NextResponse.redirect(new URL(`/admin/sixfl-tv/footage?youtubeError=${encodeURIComponent(message)}`, request.url), 302);
  }
}
