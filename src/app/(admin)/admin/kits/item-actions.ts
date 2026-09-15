"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isTeamKitSize,
  isTeamKitSockSize,
} from "@/lib/kits/constants";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

const KITS_PATH = "/admin/kits";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectToKits(input: {
  notice?: string;
  error?: string;
  team?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.notice) params.set("notice", input.notice);
  if (input.error) params.set("error", input.error);
  if (input.team) params.set("team", input.team);
  const query = params.toString();
  return `${KITS_PATH}${query ? `?${query}` : ""}`;
}

export async function updateKitOrderItemAction(formData: FormData) {
  const { user } = await requireAdmin();
  const itemId = readString(formData, "itemId");
  const teamName = readString(formData, "teamName") || null;
  const backName = readString(formData, "backName").slice(0, 30) || null;
  const shirtNumber = Number(readString(formData, "shirtNumber"));
  const kitSize = readString(formData, "kitSize");
  const sockSize = readString(formData, "sockSize");

  if (
    !itemId ||
    !Number.isInteger(shirtNumber) ||
    shirtNumber < 0 ||
    shirtNumber > 99 ||
    !isTeamKitSize(kitSize) ||
    !isTeamKitSockSize(sockSize)
  ) {
    redirect(redirectToKits({ error: "invalid_order_item", team: teamName }));
  }

  let teamId: string | null = null;

  try {
    const rows = await prisma.$queryRaw<Array<{ teamId: string; orderId: string }>>(
      Prisma.sql`
        SELECT orders."teamId", item."orderId"
        FROM "TeamKitOrderItem" AS item
        JOIN "TeamKitOrder" AS orders ON orders."id" = item."orderId"
        WHERE item."id" = ${itemId}
        LIMIT 1
      `,
    );

    const existing = rows[0];
    if (!existing) {
      redirect(redirectToKits({ error: "invalid_order_item", team: teamName }));
    }

    teamId = existing.teamId;

    const changed = await prisma.$executeRaw(Prisma.sql`
      UPDATE "TeamKitOrderItem"
      SET
        "backName" = ${backName},
        "shirtNumber" = ${shirtNumber},
        "kitSize" = ${kitSize}::"TeamKitSize",
        "sockSize" = ${sockSize}::"TeamKitSockSize",
        "updatedAt" = NOW()
      WHERE "id" = ${itemId}
    `);

    if (!changed) throw new Error("Kit order item not found.");

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "TeamKitOrder"
      SET
        "lastEditedByUserId" = ${user?.id ?? null},
        "updatedAt" = NOW()
      WHERE "id" = ${existing.orderId}
    `);
  } catch (error) {
    console.error("Kit order item update failed", error);
    redirect(redirectToKits({ error: "save_failed", team: teamName }));
  }

  revalidatePath(KITS_PATH);
  if (teamId) {
    revalidatePath(`/admin/teams/${teamId}`);
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/captain/team/${teamId}/kit`);
  }

  redirect(redirectToKits({ notice: "order_item_saved", team: teamName }));
}
