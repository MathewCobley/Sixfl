"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { FreeKitOfferError, setTeamFreeKitOffer } from "@/lib/kits/free-kit-offer";
import { requireAdmin } from "@/lib/requireAdmin";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
function destination(teamId: string, result: string) {
  return `/admin/teams/${encodeURIComponent(teamId)}?freeKit=${encodeURIComponent(result)}#free-kit-offer`;
}

// Retain the existing action export for callers; the override now applies to
// original-registration AND manually granted offers through one audited service.
export async function updateManualFreeKitOfferAction(formData: FormData) {
  const { user } = await requireAdmin();
  if (!user?.id) redirect("/login");
  const teamId = text(formData, "teamId");
  if (!teamId) redirect("/admin/teams?freeKit=missing_team");
  const value = text(formData, "enabled");
  if (value !== "true" && value !== "false") redirect(destination(teamId, "invalid_request"));
  if (text(formData, "confirmed") !== "yes") redirect(destination(teamId, "confirm_required"));

  let resultCode = "unchanged";
  try {
    const result = await setTeamFreeKitOffer({
      teamId,
      enabled: value === "true",
      actorUserId: user.id,
      reason: text(formData, "reason"),
      expectedRevision: text(formData, "expectedRevision"),
    });
    resultCode = result.changed ? (value === "true" ? "granted" : "removed") : "unchanged";
  } catch (error) {
    if (error instanceof FreeKitOfferError) resultCode = error.code;
    else {
      console.error("Free kit offer update failed", error);
      resultCode = "save_failed";
    }
  }
  revalidatePath("/admin/teams", "layout");
  revalidatePath("/admin/kits");
  revalidatePath(`/captain/team/${teamId}`, "layout");
  redirect(destination(teamId, resultCode));
}
