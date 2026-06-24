// ========================================
// File: src/app/(admin)/admin/teams/onboarding/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CAPTAIN_ONBOARDING_EMAIL_STAGE_LABELS,
  parseCaptainOnboardingEmailStage,
  queueCaptainOnboardingEmailForTeam,
} from "@/lib/captain/onboarding-emails";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { requireAdmin } from "@/lib/requireAdmin";

function redirectToOnboarding(params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  redirect(`/admin/teams/onboarding?${searchParams.toString()}`);
}

export async function sendCaptainOnboardingEmailAction(formData: FormData) {
  await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const stage = parseCaptainOnboardingEmailStage(formData.get("stage"));

  if (!teamId || !stage) {
    redirectToOnboarding({ error: "missing_details" });
  }

  const result = await queueCaptainOnboardingEmailForTeam({
    teamId,
    stage,
    force: true,
    manual: true,
  });

  if (result === "missing_team") {
    redirectToOnboarding({ error: "missing_team" });
  }

  if (result === "missing_email") {
    redirectToOnboarding({ error: "missing_email" });
  }

  if (result !== "queued") {
    redirectToOnboarding({ error: "not_sent" });
  }

  await processNotificationQueue(10).catch((error) => {
    console.error("Manual captain onboarding email queued but immediate processing failed", error);
  });

  revalidatePath("/admin/teams/onboarding");
  redirectToOnboarding({
    sent: stage,
    label: CAPTAIN_ONBOARDING_EMAIL_STAGE_LABELS[stage],
  });
}
