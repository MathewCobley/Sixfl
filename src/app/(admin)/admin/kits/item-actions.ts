"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { isTeamKitSize } from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// This action edits an existing row only. It must never call the captain's
// whole-order save, change the design/quantity/status, or touch kit payments.
export async function updateKitOrderItemAction(formData: FormData): Promise<{
  ok: boolean;
  message: string;
}> {
  const { user } = await requireAdmin();
  const itemId = text(formData, "itemId");
  const orderId = text(formData, "orderId");
  const backName = text(formData, "backName").toUpperCase().replace(/\s+/g, " ");
  const numberText = text(formData, "shirtNumber");
  const shirtNumber = Number(numberText);
  const kitSize = text(formData, "kitSize");

  // Match the existing captain personalisation limits, but reject invalid names
  // rather than silently truncating or changing what the administrator entered.
  if (
    !itemId || !orderId ||
    !/^[0-9]{1,2}$/.test(numberText) || shirtNumber < 1 || shirtNumber > 99 ||
    !isTeamKitSize(kitSize) || backName.length > 18 || /[^A-Z0-9 '&.\-]/.test(backName) ||
    !["previousBackName", "previousShirtNumber", "previousKitSize", "previousStatus"]
      .every((key) => typeof formData.get(key) === "string")
  ) {
    return { ok: false, message: "Check the details: number 1–99, an available kit size, and a back name of up to 18 letters, numbers, spaces or '&.-. Leave the name blank for number only." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the parent first, like the existing whole-order save. This protects
      // duplicate-number checks and prevents simultaneous row edits racing.
      const orders = await tx.$queryRaw<Array<{ teamId: string; status: string }>>(Prisma.sql`
        SELECT "teamId", "status"::text AS "status"
        FROM "TeamKitOrder" WHERE "id" = ${orderId} FOR UPDATE
      `);
      const order = orders[0];
      if (!order) return { ok: false as const, message: "This order no longer exists. Refresh the Kits page." };
      if (order.status === "CANCELLED") {
        return { ok: false as const, message: "Reopen this cancelled order before changing its kit details." };
      }
      if (order.status !== text(formData, "previousStatus")) {
        return { ok: false as const, message: "The order status has changed. Refresh the Kits page before editing." };
      }
      if (["ORDERED", "FULFILLED"].includes(order.status) && text(formData, "supplierConfirmed") !== "yes") {
        return { ok: false as const, message: "Confirm that you have checked this change with the supplier. Saving here does not amend a supplier order." };
      }

      const items = await tx.$queryRaw<Array<{
        id: string; backName: string | null; shirtNumber: number; kitSize: string;
      }>>(Prisma.sql`
        SELECT "id", "backName", "shirtNumber", "kitSize"::text AS "kitSize"
        FROM "TeamKitOrderItem" WHERE "orderId" = ${orderId} FOR UPDATE
      `);
      const item = items.find((row) => row.id === itemId);
      if (!item) return { ok: false as const, message: "This kit row has changed or no longer belongs to this order. Refresh the Kits page." };
      if (
        (item.backName ?? "") !== text(formData, "previousBackName") ||
        String(item.shirtNumber) !== text(formData, "previousShirtNumber") ||
        item.kitSize !== text(formData, "previousKitSize")
      ) {
        return { ok: false as const, message: "Someone has changed this row since you opened it. Refresh before editing so their changes are not overwritten." };
      }
      if (items.some((row) => row.id !== itemId && row.shirtNumber === shirtNumber)) {
        return { ok: false as const, message: "That shirt number is already used in this order. Choose a different number." };
      }

      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrderItem"
        SET "backName" = ${backName || null}, "shirtNumber" = ${shirtNumber},
            "kitSize" = ${kitSize}::"TeamKitSize", "updatedAt" = NOW()
        WHERE "id" = ${itemId} AND "orderId" = ${orderId}
      `);
      if (changed !== 1) throw new Error("Kit row update did not affect exactly one item.");
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "TeamKitOrder"
        SET "lastEditedByUserId" = ${user?.id ?? null}, "updatedAt" = NOW()
        WHERE "id" = ${orderId}
      `);
      if (updated !== 1) throw new Error("Kit order metadata update failed.");
      return { ok: true as const, teamId: order.teamId, message: "Kit details saved." };
    });

    if (result.ok) {
      revalidatePath("/admin/kits");
      revalidatePath("/api/admin/kits/orders.csv");
      revalidatePath(`/admin/teams/${result.teamId}`);
      revalidatePath(`/captain/team/${result.teamId}`);
      revalidatePath(`/captain/team/${result.teamId}/kit`);
    }
    return { ok: result.ok, message: result.message };
  } catch (error) {
    console.error("Kit order item update failed", error);
    return { ok: false, message: "The change could not be confirmed. Your entries are still here; refresh the order before retrying." };
  }
}
