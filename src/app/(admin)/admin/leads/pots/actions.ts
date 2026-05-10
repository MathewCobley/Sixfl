// ========================================
// File: src/app/(admin)/admin/leads/pots/actions.ts
// ========================================

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { isPlayerLeadPotKey } from "@/lib/leads/playerLeadPots";

export async function movePlayerLeadPotAction(
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const nextPot = String(formData.get("nextPot") ?? "").trim().toUpperCase();
  const returnTo = String(formData.get("returnTo") ?? "").trim();

  if (!leadId) {
    throw new Error("Missing lead id.");
  }

  if (!isPlayerLeadPotKey(nextPot)) {
    throw new Error("Invalid player lead pot.");
  }

  const lead = await prisma.interestLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      interestType: true,
      confirmedInterestAt: true,
      optionalDetailsRequestedAt: true,
    },
  });

  if (!lead) {
    throw new Error("Lead not found.");
  }

  if (lead.interestType !== "PLAYER") {
    throw new Error("Only player leads can be moved through player pots.");
  }

  const now = new Date();

  await prisma.interestLead.update({
    where: { id: lead.id },
    data: {
      leadPot: nextPot,
      ...(nextPot === "CONFIRMED_INTEREST" && !lead.confirmedInterestAt
        ? { confirmedInterestAt: now }
        : {}),
      ...(nextPot === "OPTIONAL_DETAILS_REQUESTED" &&
      !lead.optionalDetailsRequestedAt
        ? { optionalDetailsRequestedAt: now }
        : {}),
      ...(nextPot === "DORMANT" || nextPot === "NOT_NOW"
        ? { nextChaseDueAt: null }
        : {}),
    },
  });

  revalidatePath("/admin/leads");
  revalidatePath("/admin/leads/pots");
  revalidatePath(`/admin/leads/pots/${nextPot}`);
  revalidatePath(`/admin/leads/${lead.id}`);

  if (returnTo) {
    revalidatePath(returnTo);
  }
}
