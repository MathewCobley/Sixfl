// ========================================
// File: src/app/(admin)/admin/leads/player-flow/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getPlayerLeadFlowStatusDefinition,
  isPlayerLeadFlowStatusKey,
} from "@/lib/leads/playerLeadFlow";

export async function movePlayerLeadFlowStatusAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "")
    .trim()
    .toUpperCase();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!leadId) return;
  if (!isPlayerLeadFlowStatusKey(nextStatus)) return;

  const flowStatus = getPlayerLeadFlowStatusDefinition(nextStatus);

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      confirmedInterestAt: true,
      optionalDetailsRequestedAt: true,
    },
  });

  if (!lead || lead.interestType !== "PLAYER") return;

  const now = new Date();
  const nextStorageStatus = flowStatus.moveToStorageStatus;

  await prisma.interestLead.update({
    where: { id: lead.id },
    data: {
      leadPot: nextStorageStatus,
      ...(nextStorageStatus === "CONFIRMED_INTEREST" &&
      !lead.confirmedInterestAt
        ? { confirmedInterestAt: now }
        : {}),
      ...(nextStorageStatus === "OPTIONAL_DETAILS_REQUESTED" &&
      !lead.optionalDetailsRequestedAt
        ? { optionalDetailsRequestedAt: now }
        : {}),
      ...(nextStorageStatus === "DORMANT" || nextStorageStatus === "NOT_NOW"
        ? { nextChaseDueAt: null }
        : {}),
    },
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/player-flow");
  revalidatePath(`/admin/leads/player-flow/${nextStatus}`);
  revalidatePath(`/admin/leads/${lead.id}`);

  if (returnTo) {
    revalidatePath(returnTo);
  }
}
