"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordIndividualPlayerChoice, TeamLeadPlayerChoiceError } from "@/lib/leads/team-lead-player-choice";

export async function chooseIndividualPlayerAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const path = `/team-confirmation/${encodeURIComponent(token)}/player`;
  if (formData.get("confirmPlayerInterest") !== "yes") {
    redirect(`${path}?error=confirm`);
  }

  let leadId: string;
  try {
    ({ leadId } = await recordIndividualPlayerChoice(token));
  } catch (error) {
    if (error instanceof TeamLeadPlayerChoiceError) redirect(`${path}?error=${error.code}`);
    console.error("Could not record individual-player enquiry", error instanceof Error ? error.name : "Unknown error");
    redirect(`${path}?error=save`);
  }

  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath(`/team-confirmation/${encodeURIComponent(token)}`);
  revalidatePath(path);
  redirect(path);
}
