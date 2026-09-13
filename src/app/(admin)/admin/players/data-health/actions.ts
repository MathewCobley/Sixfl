"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { runSafePlayerDataHealthCleanup } from "@/lib/players/player-data-health-safe";
import { confirmRecruitmentIdentity } from "@/lib/players/player-data-health-reconcile";
import { markPlayerDataHealthDifferentPeople } from "@/lib/players/player-data-health-exclusions";

function refresh(enquiryTeamId?: string | null) {
  for (const path of ["/admin/players/data-health", "/admin/player-pool", "/admin/player-prospects", "/admin/leads"]) revalidatePath(path);
  if (enquiryTeamId) {
    for (const path of [`/admin/teams/${enquiryTeamId}/prospects`, `/admin/teams/${enquiryTeamId}/squad`, `/captain/team/${enquiryTeamId}/prospects`, `/captain/team/${enquiryTeamId}/squad`]) revalidatePath(path);
  }
}
export async function runCleanupNowAction(form: FormData) {
  const { user } = await requireAdmin();
  if (form.get("confirmSafe") !== "yes") redirect("/admin/players/data-health?error=Confirm+safe+cleanup+first");
  let destination: string;
  try {
    const result = await runSafePlayerDataHealthCleanup({ source: "MANUAL", force: true, actorUserId: user?.id });
    refresh();
    destination = `/admin/players/data-health?cleaned=${encodeURIComponent(`${result.affectedUsers} people reconciled. Review-only matches were left unchanged.`)}`;
  } catch (error) {
    console.error("Manual data health cleanup failed", error);
    destination = "/admin/players/data-health?error=Cleanup+could+not+finish.+Review+the+run+history+before+retrying.";
  }
  redirect(destination);
}
export async function confirmIdentityAction(form: FormData) {
  const { user } = await requireAdmin();
  const text = (key: string) => String(form.get(key) ?? "").trim();
  if (!user?.id || text("confirmation") !== "CONFIRM") redirect("/admin/players/data-health?error=Type+CONFIRM+after+checking+the+person");
  const closeOtherTeamEnquiryId = text("closeOtherTeamEnquiryId") || undefined;
  let destination: string;
  try {
    const result = await confirmRecruitmentIdentity({ kind: text("kind"), recordId: text("recordId"), fingerprint: text("fingerprint"),
      userId: text("userId"), actorUserId: user.id, reason: text("reason"), closeOtherTeamEnquiryId });
    refresh(result.enquiryTeamId);
    const message = closeOtherTeamEnquiryId && result.prospectsClosedAsDuplicate > 0
      ? "Other-team enquiry closed as a duplicate of the selected existing player. All current squads, login details, payments and communication history were kept."
      : result.changed ? "Verified recruitment record reconciled; registered account, squad and payments unchanged." : "No changes needed. Existing declined, paused and different-team records were preserved.";
    destination = `/admin/players/data-health?cleaned=${encodeURIComponent(message)}`;
  } catch (error) {
    console.error("Data health identity review failed", error);
    destination = "/admin/players/data-health?error=" + encodeURIComponent(error instanceof Error ? error.message : "Review failed. Refresh and check again.");
  }
  redirect(destination);
}

export async function markDifferentPeopleAction(form: FormData) {
  const { user } = await requireAdmin();
  const text = (key: string) => String(form.get(key) ?? "").trim();
  if (!user?.id || text("differentConfirmed") !== "yes") {
    redirect("/admin/players/data-health?error=Confirm+that+these+are+different+people+first");
  }
  let destination: string;
  try {
    const result = await markPlayerDataHealthDifferentPeople({
      kind: text("kind"), recordId: text("recordId"), userId: text("userId"),
      fingerprint: text("fingerprint"), actorUserId: user.id, reason: text("differentReason"),
    });
    refresh(result.enquiryTeamId);
    destination = `/admin/players/data-health?cleaned=${encodeURIComponent("Marked as different people. This exact pairing will no longer be suggested; both records remain unchanged.")}`;
  } catch (error) {
    console.error("Data health different-person review failed", error);
    destination = "/admin/players/data-health?error=" + encodeURIComponent(error instanceof Error ? error.message : "Review failed. Refresh and check again.");
  }
  redirect(destination);
}
