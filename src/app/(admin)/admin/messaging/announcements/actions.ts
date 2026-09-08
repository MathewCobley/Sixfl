"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import { AnnouncementReviewError, queueSystemAnnouncement } from "@/lib/communications/announcement-queue";

// Retain the legacy server-action boundary, but never run the delivery processor
// in the browser request. Stale forms must reload and review the pinned revision.
export async function sendSystemAnnouncementAction(formData: FormData) {
  const { user } = await requireAdmin();
  const templateId = String(formData.get("templateId") ?? "").trim();
  const params = new URLSearchParams({ template: templateId });
  try {
    if (!user?.id) throw new AnnouncementReviewError("Administrator access is required.");
    const result = await queueSystemAnnouncement({
      templateId, sourceId: String(formData.get("sourceId") ?? ""),
      audienceKey: String(formData.get("audienceKey") ?? ""),
      confirmed: formData.get("confirm") === "yes", actorUserId: user.id,
    });
    params.set("sent", "1");
    params.set("queued", String(result.progress.queued));
    params.set("skipped", String(result.progress.skipped + result.progress.cancelled));
    params.set("already", String(result.progress.sent + result.progress.processing));
    params.set("failed", String(result.queueFailures));
  } catch (error) {
    params.set("error", error instanceof AnnouncementReviewError ? error.message : "Queueing could not be confirmed. Check progress before trying again; some emails may already be queued.");
  }
  redirect(`/admin/messaging/announcements?${params}`);
}
