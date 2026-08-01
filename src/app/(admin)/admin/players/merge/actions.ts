"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  mergePlayerAccounts,
  PlayerMergeConflictError,
} from "@/lib/players/player-account-merge";
import { requireAdmin } from "@/lib/requireAdmin";

function mergePagePath(input: {
  userId: string;
  teamId?: string | null;
  error?: string | null;
  merged?: boolean;
}) {
  const params = new URLSearchParams();
  if (input.teamId) params.set("teamId", input.teamId);
  if (input.error) params.set("error", input.error);
  if (input.merged) params.set("merged", "1");
  const query = params.toString();
  return `/admin/players/merge/${input.userId}${query ? `?${query}` : ""}`;
}

export async function mergePlayerAccountsAction(formData: FormData) {
  const access = await requireAdmin();
  const keptUserId = String(formData.get("keptUserId") ?? "").trim();
  const mergedUserId = String(formData.get("mergedUserId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim() || null;
  const confirmation = String(formData.get("confirmation") ?? "").trim().toUpperCase();
  const fallbackUserId = mergedUserId || keptUserId;

  if (!keptUserId || !mergedUserId) {
    redirect(
      mergePagePath({
        userId: fallbackUserId,
        teamId,
        error: "Choose the account to keep and the duplicate account to merge.",
      }),
    );
  }

  if (confirmation !== "MERGE") {
    redirect(
      mergePagePath({
        userId: mergedUserId,
        teamId,
        error: "Type MERGE to confirm the player-account merge.",
      }),
    );
  }

  try {
    const result = await mergePlayerAccounts({
      keptUserId,
      mergedUserId,
      mergedByUserId: access.user?.id ?? null,
      mergedByEmail: access.user?.email ?? access.session?.user?.email ?? null,
    });

    revalidatePath("/admin/teams");
    revalidatePath("/admin/users");
    revalidatePath("/admin/player-pool");
    revalidatePath("/admin/player-prospects");
    revalidatePath(`/admin/players/merge/${result.keptUserId}`);
    if (teamId) {
      revalidatePath(`/admin/teams/${teamId}`);
      revalidatePath(`/admin/teams/${teamId}/squad`);
      revalidatePath(`/captain/team/${teamId}/captain-squad`);
      revalidatePath(`/captain/team/${teamId}/squad`);
      revalidatePath(`/captain/team/${teamId}/payments`);
      revalidatePath(`/captain/team/${teamId}/player-payments`);
    }

    redirect(
      mergePagePath({
        userId: result.keptUserId,
        teamId,
        merged: true,
      }),
    );
  } catch (error) {
    const message =
      error instanceof PlayerMergeConflictError
        ? error.message
        : error instanceof Error && error.message
          ? error.message
          : "The player accounts could not be merged.";

    console.error("Player account merge failed", {
      keptUserId,
      mergedUserId,
      teamId,
      error,
    });

    redirect(
      mergePagePath({
        userId: mergedUserId,
        teamId,
        error: message,
      }),
    );
  }
}
