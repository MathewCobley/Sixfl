// ========================================
// File: src/app/(admin)/admin/kits/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isTeamKitOrderStatus } from "@/lib/kits/constants";
import {
  updateKitDesignMetadata,
  updateTeamKitOrderAdminNotes,
  updateTeamKitOrderStatus,
} from "@/lib/kits/db";
import { requireAdmin } from "@/lib/requireAdmin";

const KITS_PATH = "/admin/kits";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectToKits(input: {
  notice?: string;
  error?: string;
  code?: string | null;
  team?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.notice) params.set("notice", input.notice);
  if (input.error) params.set("error", input.error);
  if (input.code) params.set("code", input.code);
  if (input.team) params.set("team", input.team);
  const query = params.toString();
  return `${KITS_PATH}${query ? `?${query}` : ""}`;
}

function knownDatabaseError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return "duplicate_code";
  }
  return "save_failed";
}

export async function updateKitDesignAction(formData: FormData) {
  await requireAdmin();

  const id = readString(formData, "id");
  const code = readString(formData, "code");
  const sortOrder = Number(readString(formData, "sortOrder") || 0);

  if (!id || !code || !Number.isInteger(sortOrder)) {
    redirect(redirectToKits({ error: "invalid_design" }));
  }

  try {
    await updateKitDesignMetadata({
      id,
      code,
      name: readString(formData, "name") || null,
      primaryColour: readString(formData, "primaryColour") || null,
      secondaryColour: readString(formData, "secondaryColour") || null,
      style: readString(formData, "style") || null,
      sortOrder,
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    console.error("Kit design update failed", error);
    redirect(redirectToKits({ error: knownDatabaseError(error), code }));
  }

  revalidatePath(KITS_PATH);
  revalidatePath("/captain");
  redirect(redirectToKits({ notice: "design_saved", code }));
}

export async function updateKitOrderStatusAction(formData: FormData) {
  const { user } = await requireAdmin();
  const orderId = readString(formData, "orderId");
  const status = readString(formData, "status");
  const teamName = readString(formData, "teamName") || null;

  if (!orderId || !isTeamKitOrderStatus(status)) {
    redirect(redirectToKits({ error: "invalid_order" }));
  }

  try {
    await updateTeamKitOrderStatus({
      orderId,
      status,
      editedByUserId: user?.id ?? null,
    });
  } catch (error) {
    console.error("Kit order status update failed", error);
    redirect(redirectToKits({ error: "save_failed", team: teamName }));
  }

  revalidatePath(KITS_PATH);
  revalidatePath("/captain");
  redirect(redirectToKits({ notice: "order_status_saved", team: teamName }));
}

export async function updateKitOrderNotesAction(formData: FormData) {
  const { user } = await requireAdmin();
  const orderId = readString(formData, "orderId");
  const teamName = readString(formData, "teamName") || null;

  if (!orderId) {
    redirect(redirectToKits({ error: "invalid_order" }));
  }

  try {
    await updateTeamKitOrderAdminNotes({
      orderId,
      adminNotes: readString(formData, "adminNotes") || null,
      editedByUserId: user?.id ?? null,
    });
  } catch (error) {
    console.error("Kit order notes update failed", error);
    redirect(redirectToKits({ error: "save_failed", team: teamName }));
  }

  revalidatePath(KITS_PATH);
  redirect(redirectToKits({ notice: "order_notes_saved", team: teamName }));
}
