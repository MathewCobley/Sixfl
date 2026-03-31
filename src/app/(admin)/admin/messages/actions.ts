// ========================================
// File: src/app/(admin)/admin/messages/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getMessageThreadById,
  markThreadAsReadForAdmin,
} from "@/lib/messaging/service";

function getTrimmedValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function markMessageThreadReadAction(formData: FormData) {
  await requireAdmin();

  const threadId = getTrimmedValue(formData.get("threadId"));
  const filter = getTrimmedValue(formData.get("filter")) || "unread";

  if (!threadId) {
    redirect("/admin/messages?error=missing_thread");
  }

  await markThreadAsReadForAdmin(threadId);

  const thread = await getMessageThreadById(threadId);

  revalidatePath("/admin");
  revalidatePath("/admin/messages");

  if (thread?.teamId) {
    revalidatePath(`/admin/teams/${thread.teamId}`);
  }

  if (thread?.leagueId) {
    revalidatePath(`/admin/leagues/${thread.leagueId}`);
  }

  redirect(
    `/admin/messages?filter=${encodeURIComponent(filter)}&thread=${threadId}&read=1`,
  );
}
