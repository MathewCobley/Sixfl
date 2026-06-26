// ========================================
// File: src/app/(admin)/admin/referee-availability/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  normaliseMonthKey,
  queueMonthlyRefereeAvailabilityRequests,
} from "@/lib/referee-availability";
import { requireAdmin } from "@/lib/requireAdmin";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function sendRefereeAvailabilityRequestsAction(formData: FormData) {
  await requireAdmin();

  const monthKey = normaliseMonthKey(readString(formData, "month"));
  const force = readString(formData, "force") === "yes";
  const summary = await queueMonthlyRefereeAvailabilityRequests({ monthKey, force });

  revalidatePath("/admin/referee-availability");
  redirect(
    `/admin/referee-availability?month=${encodeURIComponent(monthKey)}&sent=${summary.queued}&already=${summary.alreadyQueuedOrSent}&skipped=${summary.skipped}`,
  );
}
