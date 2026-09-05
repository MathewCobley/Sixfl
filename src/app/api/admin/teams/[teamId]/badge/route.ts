import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { ImageUploadError, optimiseBadgeImage, readImageUploadForm } from "@/lib/images/upload";
import { saveTeamBadge, TeamBadgeError } from "@/lib/team-badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSameOriginUpload(request: Request) {
  // A custom header also prevents cross-site HTML forms from submitting uploads.
  if (request.headers.get("x-sixfl-upload") !== "1") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (origin.protocol !== "https:" && origin.protocol !== "http:") return false;
    const hosts = new Set([new URL(request.url).host, request.headers.get("host")]);
    if (process.env.NEXTAUTH_URL) hosts.add(new URL(process.env.NEXTAUTH_URL).host);
    return hosts.has(origin.host);
  } catch {
    return false;
  }
}

export async function POST(request: Request, context: { params: Promise<{ teamId: string }> }) {
  // Keep redirects outside the catch so an unauthorised session can never reach a write.
  const { user } = await requireAdmin();
  if (!isSameOriginUpload(request)) {
    return NextResponse.json({ ok: false, error: "Please upload from the SIXFL website." }, { status: 403 });
  }

  try {
    const { teamId } = await context.params;
    const form = await readImageUploadForm(request);
    const action = form.get("action");
    const expectedLogoUrl = form.get("expectedLogoUrl");
    if ((action !== "save" && action !== "remove") || typeof expectedLogoUrl !== "string") {
      throw new ImageUploadError("Please use the team badge upload form.");
    }
    let image = null;
    if (action === "save") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new ImageUploadError("Choose an image first.");
      image = await optimiseBadgeImage(file);
    }
    const logoUrl = await saveTeamBadge({ teamId, expectedLogoUrl, image, createdByUserId: user?.id ?? null });
    // Badges are shared by admin, captain, player, fixture and public league pages.
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, logoUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ImageUploadError || error instanceof TeamBadgeError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("Team badge upload failed", error);
    return NextResponse.json({ ok: false, error: "The badge could not be saved. Please try again." }, { status: 500 });
  }
}
