import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { StudioError } from "@/lib/sixfl-tv/studio";
import { completeYoutubeAuthorisation } from "@/lib/sixfl-tv/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function publicReturnOrigin() {
  const configured =
    process.env.YOUTUBE_REDIRECT_URI?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk";

  try {
    return new URL(configured).origin;
  } catch {
    return "https://www.sixfl.co.uk";
  }
}

function publicRedirect(path: string) {
  return NextResponse.redirect(new URL(path, `${publicReturnOrigin()}/`), 302);
}

export async function GET(request: Request) {
  const { user, session } = await requireAdmin();
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state"), denied = url.searchParams.get("error");
  const actor = user?.id || session?.user?.email || "development-admin";
  if (denied) return publicRedirect(`/admin/sixfl-tv/settings?youtubeError=${encodeURIComponent("Google authorisation was cancelled or denied.")}`);
  if (!code || !state) return publicRedirect(`/admin/sixfl-tv/settings?youtubeError=${encodeURIComponent("Google did not return the required YouTube authorisation details.")}`);
  try {
    const fixtureId = await completeYoutubeAuthorisation(code, state, actor);
    return fixtureId
      ? publicRedirect(`/admin/sixfl-tv/footage/${encodeURIComponent(fixtureId)}?youtube=connected`)
      : publicRedirect("/admin/sixfl-tv/settings?youtube=connected");
  } catch (error) {
    const message = error instanceof StudioError ? error.message : "YouTube authorisation could not be completed.";
    return publicRedirect(`/admin/sixfl-tv/settings?youtubeError=${encodeURIComponent(message)}`);
  }
}
