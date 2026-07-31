// ========================================
// File: src/app/captain/team/[teamid]/kit/actions.ts
// ========================================

"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  TEAM_KIT_QUANTITY,
  isTeamKitSize,
  isTeamKitSockSize,
} from "@/lib/kits/constants";
import {
  getKitDesignById,
  getTeamKitOrder,
  saveTeamKitOrder,
  type SaveTeamKitOrderItemInput,
} from "@/lib/kits/db";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function buildRedirect(
  teamId: string,
  input: { saved?: boolean; submitted?: boolean; error?: string },
) {
  const params = new URLSearchParams();
  if (input.saved) params.set("saved", "1");
  if (input.submitted) params.set("submitted", "1");
  if (input.error) params.set("error", input.error);
  const query = params.toString();
  return `/captain/team/${teamId}/kit${query ? `?${query}` : ""}`;
}

function cleanBackName(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-Z0-9 '&.-]/g, "")
    .trim()
    .slice(0, 18);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, Prisma.JsonValue>;
  }
  return value as Record<string, Prisma.JsonValue>;
}

async function syncSelectedKitToTeam(input: {
  teamId: string;
  design: NonNullable<Awaited<ReturnType<typeof getKitDesignById>>>;
}) {
  const { recipient } = await upsertTeamNotificationRecipient(input.teamId);
  const metadata = {
    ...jsonObject(recipient.metadata),
    kitDesignId: input.design.id,
    kitDesignCode: input.design.code,
    kitDesignName: input.design.name,
    kitPrimaryColour: input.design.primaryColour,
    kitSecondaryColour: input.design.secondaryColour,
    kitStyle: input.design.style,
    kitImageUrl: `/api/kits/${input.design.id}/image?size=full`,
  };

  await prisma.notificationRecipient.update({
    where: { id: recipient.id },
    data: {
      metadata: JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue,
    },
  });
}

export async function saveTeamKitOrderAction(formData: FormData) {
  const teamId = readString(formData, "teamId");
  if (!teamId) redirect("/captain?error=missing_team");

  const access = await requireCaptain(teamId);
  const existingOrder = await getTeamKitOrder(teamId);

  if (existingOrder && existingOrder.status !== "DRAFT") {
    redirect(buildRedirect(teamId, { error: "order_locked" }));
  }

  const kitDesignId = readString(formData, "kitDesignId");
  if (!kitDesignId) {
    redirect(buildRedirect(teamId, { error: "choose_design" }));
  }

  const design = await getKitDesignById(kitDesignId);
  if (!design) {
    redirect(buildRedirect(teamId, { error: "design_unavailable" }));
  }

  const items: SaveTeamKitOrderItemInput[] = [];
  const numbers = new Set<number>();

  for (let position = 1; position <= TEAM_KIT_QUANTITY; position += 1) {
    const kitSize = readString(formData, `kitSize_${position}`);
    const sockSize = readString(formData, `sockSize_${position}`);
    const numberText = readString(formData, `shirtNumber_${position}`);
    const shirtNumber = Number(numberText);

    if (!isTeamKitSize(kitSize)) {
      redirect(buildRedirect(teamId, { error: `missing_kit_size_${position}` }));
    }

    if (!isTeamKitSockSize(sockSize)) {
      redirect(buildRedirect(teamId, { error: `missing_sock_size_${position}` }));
    }

    if (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99) {
      redirect(buildRedirect(teamId, { error: `invalid_number_${position}` }));
    }

    if (numbers.has(shirtNumber)) {
      redirect(buildRedirect(teamId, { error: "duplicate_numbers" }));
    }
    numbers.add(shirtNumber);

    items.push({
      position,
      backName: cleanBackName(readString(formData, `backName_${position}`)) || null,
      shirtNumber,
      kitSize,
      sockSize,
    });
  }

  const intent = readString(formData, "intent");
  const status = intent === "submit" ? "SUBMITTED" : "DRAFT";

  try {
    await saveTeamKitOrder({
      teamId,
      kitDesignId,
      captainNotes: readString(formData, "captainNotes") || null,
      status,
      editedByUserId: access.user?.id ?? null,
      items,
    });

    await syncSelectedKitToTeam({ teamId, design });
  } catch (error) {
    console.error("Team kit order could not be saved", error);
    redirect(buildRedirect(teamId, { error: "save_failed" }));
  }

  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/captain/team/${teamId}/kit`);
  revalidatePath("/admin/kits");

  redirect(
    buildRedirect(teamId, {
      saved: status === "DRAFT",
      submitted: status === "SUBMITTED",
    }),
  );
}
