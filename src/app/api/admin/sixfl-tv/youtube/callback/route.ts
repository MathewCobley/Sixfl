import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { StudioError } from "@/lib/sixfl-tv/studio";
import { completeYoutubeAuthorisation } from "@/lib/sixfl-tv/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { user, session } = await requireAdmin();
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state"), denied = url.searchParams.get("error");
  const actor = user?.id || session?.user?.email || "development-admin";
  if (denied) return NextResponse.redirect(new URL(`/admin/sixfl-tv/footage?youtubeError=${encodeURIComponent("Google authorisation was cancelled or denied.")}`, request.url), 302);
  if (!code || !state) return NextResponse.redirect(new URL(`/admin/sixfl-tv/footage?youtubeError=${encodeURIComponent("Google did not return the required YouTube authorisation details.")}`, request.url), 302);
  try {
    const fixtureId = await completeYoutubeAuthorisation(code, state, actor);
    return NextResponse.redirect(new URL(`/admin/sixfl-tv/footage/${encodeURIComponent(fixtureId)}?youtube=connected`, request.url), 302);
  } catch (error) {
    const message = error instanceof StudioError ? error.message : "YouTube authorisation could not be completed.";
    return NextResponse.redirect(new URL(`/admin/sixfl-tv/footage?youtubeError=${encodeURIComponent(message)}`, request.url), 302);
  }
}
