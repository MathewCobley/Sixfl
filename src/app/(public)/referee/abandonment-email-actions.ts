"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReferee } from "@/lib/admin";
import { resendFixtureAbandonmentEmails } from "@/lib/fixtures/abandonment-email-recovery";
import { getRefereeNightFixtureIds } from "@/lib/referee-nights";

function required(formData: FormData, key: string, label: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export async function resendNightFixtureAbandonmentEmailsAction(formData: FormData) {
  const { user } = await requireReferee();
  if (user.role !== UserRole.ADMIN) {
    throw new Error("Only SIXFL admin can resend abandoned-match decision emails.");
  }

  const refereeNightId = required(formData, "refereeNightId", "Referee night");
  const fixtureId = required(formData, "fixtureId", "Fixture");
  const fixtureIds = await getRefereeNightFixtureIds(refereeNightId);
  if (!fixtureIds.includes(fixtureId)) {
    throw new Error("Fixture is not part of this referee night.");
  }

  const result = await resendFixtureAbandonmentEmails({
    fixtureId,
    createdByUserId: user.id,
  });

  revalidatePath(`/referee/night/${refereeNightId}`);
  revalidatePath("/admin/teams");
  revalidatePath("/admin/messages");

  redirect(
    `/referee/night/${refereeNightId}?saved=abandonment-emails-resent&queued=${result.queued}&failed=${result.failed}`,
  );
}
