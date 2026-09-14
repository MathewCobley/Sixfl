"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { saveTeamMoveResponse } from "@/lib/teams/move-response";

function safeToken(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "We could not save that response. Please contact SIXFL.";
}

export async function submitTeamMoveResponseAction(formData: FormData) {
  const token = safeToken(formData.get("token"));
  const answer = safeToken(formData.get("answer")).toUpperCase();

  if (!token) {
    redirect("/team-move/invalid?error=Missing%20response%20link.");
  }

  if (answer !== "YES" && answer !== "NO") {
    redirect(`/team-move/${encodeURIComponent(token)}?error=${encodeURIComponent("Choose Yes or No before confirming.")}`);
  }

  try {
    const result = await saveTeamMoveResponse({
      token,
      response: answer === "YES" ? "CONFIRMED" : "DECLINED",
    });

    revalidatePath("/admin/teams");
    revalidatePath(`/admin/teams/${result.team.id}`);
    revalidatePath(`/admin/leagues/${result.league.id}/communications`);
  } catch (error) {
    redirect(
      `/team-move/${encodeURIComponent(token)}?error=${encodeURIComponent(errorMessage(error))}`,
    );
  }

  redirect(`/team-move/${encodeURIComponent(token)}?saved=1`);
}
