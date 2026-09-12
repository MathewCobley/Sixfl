"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { runSafePlayerDataHealthCleanup } from "@/lib/players/player-data-health-safe";
import { confirmRecruitmentIdentity } from "@/lib/players/player-data-health-reconcile";

function refresh() {
  for (const path of ["/admin/players/data-health", "/admin/player-pool", "/admin/player-prospects", "/admin/leads"]) revalidatePath(path);
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
  // Redirect is a Next.js control-flow exception, not a cleanup failure.
  redirect(destination);
}
export async function confirmIdentityAction(form: FormData) {
  const { user } = await requireAdmin();
  const text = (key: string) => String(form.get(key) ?? "").trim();
  if (!user?.id || text("confirmation") !== "CONFIRM") redirect("/admin/players/data-health?error=Type+CONFIRM+after+checking+the+person");
  let destination: string;
  try {
    const result = await confirmRecruitmentIdentity({ kind: text("kind"), recordId: text("recordId"), fingerprint: text("fingerprint"),
      userId: text("userId"), actorUserId: user.id, reason: text("reason") });
    refresh();
    destination = `/admin/players/data-health?cleaned=${encodeURIComponent(result.changed ? "Verified recruitment record reconciled; registered account, squad and payments unchanged." : "No changes needed. Existing declined, paused and different-team records were preserved.")}`;
  } catch (error) {
    console.error("Data health identity review failed", error);
    destination = "/admin/players/data-health?error=" + encodeURIComponent(error instanceof Error ? error.message : "Review failed. Refresh and check again.");
  }
  redirect(destination);
}
