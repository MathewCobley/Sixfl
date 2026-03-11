// ========================================
// File: src/app/admin/leads/actions.ts
// ========================================

"use server";

import { redirect } from "next/navigation";
import { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

function isLeadStatus(value: string): value is LeadStatus {
  return (
    value === "NEW" ||
    value === "CONTACTED" ||
    value === "QUALIFIED" ||
    value === "CLOSED"
  );
}

export async function updateLeadStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "").trim().toUpperCase();
  const returnTo = String(formData.get("returnTo") ?? "/admin/leads").trim();

  if (!id || !isLeadStatus(statusRaw)) {
    redirect(returnTo || "/admin/leads");
  }

  await prisma.interestLead.update({
    where: { id },
    data: {
      status: statusRaw,
      ...(statusRaw === "CONTACTED" ? { contactedAt: new Date() } : {}),
      ...(statusRaw === "CLOSED" ? { closedAt: new Date() } : {}),
    },
  });

  redirect(returnTo || "/admin/leads");
}