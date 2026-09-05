"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { respondToEveningToken } from "@/lib/referees/evening-notifications";

export async function respondToEveningAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const answer = String(formData.get("answer") ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || (answer !== "yes" && answer !== "no")) redirect("/referee");
  const saved = await respondToEveningToken(token, answer);
  revalidatePath("/referee");
  revalidatePath("/admin/referee-nights");
  revalidatePath("/admin/night-board");
  redirect(`/referee-evening-confirm/${token}?result=${saved ? answer : "stale"}`);
}
