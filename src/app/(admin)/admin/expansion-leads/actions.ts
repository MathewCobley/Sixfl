// ========================================
// File: src/app/(admin)/admin/expansion-leads/actions.ts
// ========================================

"use server";

import { LeadStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { EXPANSION_LEAD_SOURCE } from "@/lib/expansion-leads";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function isLeadStatus(value: string): value is LeadStatus {
  return (
    value === LeadStatus.NEW ||
    value === LeadStatus.CONTACTED ||
    value === LeadStatus.QUALIFIED ||
    value === LeadStatus.CLOSED
  );
}

export async function updateExpansionLeadStatusAction(formData: FormData) {
  await requireAdmin();

  const leadId = String(formData.get("leadId") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim();

  if (!leadId || !isLeadStatus(statusRaw)) return;

  const lead = await prisma.interestLead.findFirst({
    where: {
      id: leadId,
      source: EXPANSION_LEAD_SOURCE,
    },
    select: {
      id: true,
      status: true,
      contactedAt: true,
      closedAt: true,
    },
  });

  if (!lead) return;

  await prisma.interestLead.update({
    where: { id: lead.id },
    data: {
      status: statusRaw,
      contactedAt:
        statusRaw === LeadStatus.CONTACTED && !lead.contactedAt
          ? new Date()
          : undefined,
      closedAt:
        statusRaw === LeadStatus.CLOSED
          ? lead.closedAt ?? new Date()
          : null,
    },
  });

  revalidatePath("/admin/expansion-leads");
  revalidatePath("/admin/leads");
}
