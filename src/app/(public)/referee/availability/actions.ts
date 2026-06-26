// ========================================
// File: src/app/(public)/referee/availability/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  normaliseMonthKey,
  updateRefereeAvailability,
  type RefereeAvailabilityStatus,
} from "@/lib/referee-availability";
import { requireReferee } from "@/lib/admin";

const VALID_STATUSES = new Set<RefereeAvailabilityStatus>([
  "AVAILABLE",
  "MAYBE",
  "UNAVAILABLE",
  "NO_RESPONSE",
]);

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getStatus(value: string): RefereeAvailabilityStatus {
  return VALID_STATUSES.has(value as RefereeAvailabilityStatus)
    ? (value as RefereeAvailabilityStatus)
    : "NO_RESPONSE";
}

export async function saveRefereeAvailabilityAction(formData: FormData) {
  const { user } = await requireReferee();
  const monthKey = normaliseMonthKey(readString(formData, "month"));
  const rowIndexes = formData
    .getAll("rowIndex")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const updates = rowIndexes
    .map((index) => {
      const leagueId = readString(formData, `leagueId_${index}`);
      const date = readString(formData, `date_${index}`);
      const status = getStatus(readString(formData, `status_${index}`));
      const note = readString(formData, `note_${index}`) || null;

      if (!leagueId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

      return {
        leagueId,
        date,
        status,
        note,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (updates.length > 0) {
    await updateRefereeAvailability({
      refereeId: user.id,
      updates,
    });
  }

  revalidatePath("/referee");
  revalidatePath("/referee/availability");
  redirect(`/referee/availability?month=${encodeURIComponent(monthKey)}&saved=1`);
}
