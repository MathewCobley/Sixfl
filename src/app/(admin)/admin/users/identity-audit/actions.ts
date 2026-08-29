"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { applySharedEmailRepair } from "@/lib/players/shared-email-repair";
import { requireAdmin } from "@/lib/requireAdmin";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function applySharedEmailRepairAction(formData: FormData) {
  const { session, user } = await requireAdmin();

  const sharedEmail = text(formData, "sharedEmail");
  const separateName = text(formData, "separateName");
  const newEmail = text(formData, "newEmail");
  const newPhone = text(formData, "newPhone") || null;
  const confirmed = text(formData, "confirmed") === "on";

  const params = new URLSearchParams({
    sharedEmail,
    separateName,
    newEmail,
    ...(newPhone ? { newPhone } : {}),
  });

  if (!confirmed) {
    params.set("repairError", "Tick the confirmation box before applying the repair.");
    redirect(`/admin/users/identity-audit?${params.toString()}`);
  }

  let result;
  try {
    result = await applySharedEmailRepair({
      repair: { sharedEmail, separateName, newEmail, newPhone },
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? session?.user?.email ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared-email repair failed safely.";
    params.set("repairError", message);
    redirect(`/admin/users/identity-audit?${params.toString()}`);
  }

  revalidatePath("/admin/users/identity-audit");
  revalidatePath("/admin/users");
  revalidatePath("/admin/email-audit");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/player-pool");
  revalidatePath("/admin/messaging");

  params.set("repairDone", "1");
  params.set("usersUpdated", String(result.usersUpdated));
  params.set("leadsUpdated", String(result.leadsUpdated));
  params.set("prospectsUpdated", String(result.prospectsUpdated));
  params.set("recipientsResynced", String(result.playerSourceRecipientsResynced));
  params.set("unresolvedRecipients", String(result.unresolvedRecipientsLeft));
  redirect(`/admin/users/identity-audit?${params.toString()}`);
}
