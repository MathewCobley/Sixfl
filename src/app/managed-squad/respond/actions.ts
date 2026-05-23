// ========================================
// File: src/app/managed-squad/respond/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { recordManagedSquadInviteResponse } from "@/lib/managed-squads/invitations";

function getString(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function getAnswer(value: FormDataEntryValue | null): "yes" | "no" {
  return getString(value).toLowerCase() === "no" ? "no" : "yes";
}

export async function submitManagedSquadResponseAction(formData: FormData) {
  const token = getString(formData.get("token"));
  const answer = getAnswer(formData.get("answer"));

  if (!token) {
    redirect("/managed-squad/respond?error=missing-token");
  }

  try {
    await recordManagedSquadInviteResponse({
      token,
      answer,
      canDoSomeTuesdays: formData.get("canDoSomeTuesdays") === "on",
      preferredPosition: getString(formData.get("preferredPosition")) || null,
      phone: getString(formData.get("phone")) || null,
      notes: getString(formData.get("notes")) || null,
    });

    redirect(`/managed-squad/respond?submitted=1&answer=${answer}`);
  } catch (error) {
    console.error("Failed to submit managed squad response", error);
    redirect("/managed-squad/respond?error=submit-failed");
  }
}
