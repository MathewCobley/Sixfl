"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireReferee } from "@/lib/admin";
import { ensureRefereeNightConfirmationColumns } from "@/lib/referee-night-confirmations";
import { recordEveningAnswerForNight } from "@/lib/referees/evening-notifications";

export async function respondToRefereeNightAction(formData: FormData) {
  const { user } = await requireReferee();
  await ensureRefereeNightConfirmationColumns();

  const refereeNightId = String(formData.get("refereeNightId") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim().toLowerCase();

  if (!refereeNightId || (answer !== "yes" && answer !== "no")) {
    redirect("/referee?confirmation=invalid");
  }

  const updated = await recordEveningAnswerForNight(refereeNightId, answer, user.id);

  revalidatePath("/referee");
  revalidatePath(`/referee/night/${refereeNightId}`);

  if (!updated) {
    redirect("/referee?confirmation=stale");
  }

  redirect(`/referee?confirmation=${answer === "yes" ? "confirmed" : "declined"}`);
}
