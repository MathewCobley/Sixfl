"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { applySharedEmailRepair } from "@/lib/players/shared-email-repair";
import { quarantineUnresolvedSharedEmailPlayerRecipients } from "@/lib/players/shared-email-unresolved";
import { requireAdmin } from "@/lib/requireAdmin";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function buildParams(formData: FormData) {
  const sharedEmail = text(formData, "sharedEmail");
  const separateName = text(formData, "separateName");
  const newEmail = text(formData, "newEmail");
  const newPhone = text(formData, "newPhone") || null;

  return {
    sharedEmail,
    separateName,
    newEmail,
    newPhone,
    params: new URLSearchParams({
      sharedEmail,
      separateName,
      ...(newEmail ? { newEmail } : {}),
      ...(newPhone ? { newPhone } : {}),
    }),
  };
}

export async function applySharedEmailRepairAction(formData: FormData) {
  const { session, user } = await requireAdmin();
  const { sharedEmail, separateName, newEmail, newPhone, params } = buildParams(formData);
  const confirmed = text(formData, "confirmed") === "on";

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

export async function quarantineUnresolvedSharedEmailAction(formData: FormData) {
  const { session, user } = await requireAdmin();
  const { sharedEmail, separateName, params } = buildParams(formData);
  const confirmed = text(formData, "quarantineConfirmed") === "on";
  const target = "/admin/users/identity-audit/unresolved";

  if (!confirmed) {
    params.set("cleanupError", "Tick the confirmation box before quarantining the stale metadata.");
    redirect(`${target}?${params.toString()}`);
  }

  try {
    const result = await quarantineUnresolvedSharedEmailPlayerRecipients({
      sharedEmail,
      separateName,
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? session?.user?.email ?? null,
    });

    revalidatePath("/admin/users/identity-audit");
    revalidatePath("/admin/users/identity-audit/unresolved");
    revalidatePath("/admin/email-audit");
    revalidatePath("/admin/messaging");

    params.set("cleanupDone", "1");
    params.set("quarantined", String(result.quarantined));
    redirect(`${target}?${params.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The stale metadata cleanup failed safely.";
    params.set("cleanupError", message);
    redirect(`${target}?${params.toString()}`);
  }
}
