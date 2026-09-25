"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeUkMobileNumber } from "@/lib/phone/normalize";
import {
  buildLeadCampaignWhere, parseLeadCampaignFilters, parseLeadCampaignChannel,
  leadCampaignConfirmation, prepareLeadCampaignSend,
  type LeadCampaignFilters, type LeadCampaignChannel, type LeadCampaignPreview,
  type LeadCampaignRecipient, type LeadCampaignSendResult,
} from "@/lib/leads/campaign-filters";
import { sendBulkLeadEmailAction, sendBulkLeadSmsAction } from "@/app/(admin)/admin/leads/guarded-bulk-actions";

const MAX_PREVIEW = 1000;

async function audience(filters: LeadCampaignFilters, channel: LeadCampaignChannel, ids?: string[]) {
  const rows = await prisma.interestLead.findMany({
    where: buildLeadCampaignWhere(filters, ids),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: MAX_PREVIEW + 1,
    select: {
      id: true, contactName: true, email: true, phone: true,
      interestType: true, status: true, area: true,
      league: { select: { name: true, season: true } },
    },
  });
  if (rows.length > MAX_PREVIEW) throw new Error("More than 1,000 leads match. Narrow the filters before choosing recipients; no partial list has been selected.");
  const ready = rows.filter(row => channel === "EMAIL"
    ? Boolean(row.email?.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim()))
    : Boolean(row.phone && normalizeUkMobileNumber(row.phone)));
  const recipients: LeadCampaignRecipient[] = ready.map(row => ({
    id: row.id, contactName: row.contactName, email: row.email, phone: row.phone,
    interestType: row.interestType, status: row.status, area: row.area,
    leagueLabel: row.league ? [row.league.name, row.league.season].filter(Boolean).join(" · ") : "No prospective league set",
  }));
  return { recipients, matchingCount: rows.length, missingContactCount: rows.length - ready.length };
}

/** Read-only: applying filters never sends, marks contacted, or creates decision links. */
export async function previewLeadCampaignAction(data: FormData): Promise<LeadCampaignPreview> {
  await requireAdmin();
  try {
    const filters = parseLeadCampaignFilters(data);
    const channel = parseLeadCampaignChannel(data);
    return { ok: true, filters, channel, ...await audience(filters, channel) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not load the leads. Please try again." };
  }
}

export async function sendLeadCampaignAction(_previous: LeadCampaignSendResult, data: FormData): Promise<LeadCampaignSendResult> {
  await requireAdmin();
  try {
    const filters = parseLeadCampaignFilters(data);
    const channel = parseLeadCampaignChannel(data);
    const ids = Array.from(new Set(data.getAll("includedLeadIds").map(String).map(id => id.trim()).filter(Boolean)));
    if (!ids.length) return { ok: false, error: "Select at least one lead before sending." };
    if (ids.length > MAX_PREVIEW) return { ok: false, error: "Apply the filters again and review the recipient list." };

    // Intersect the exact preview selection with the CURRENT filter results.
    // New matching leads are not included; changed or reclassified leads fail closed.
    const current = await audience(filters, channel, ids);
    if (current.recipients.length !== ids.length) {
      return { ok: false, error: "The recipient list has changed, or a selected lead no longer matches these filters. Apply filters again and review the selection before sending." };
    }
    const phrase = leadCampaignConfirmation(ids.length, channel);
    if (ids.length > 20 && String(data.get("bulkSendConfirmation") ?? "").trim().replace(/\s+/g, " ").toUpperCase() !== phrase) {
      return { ok: false, error: `Type ${phrase} to confirm this send.` };
    }

    const templateId = String(data.get("templateId") ?? "").trim();
    if (!templateId) return { ok: false, error: "Please choose a template." };
    const template = channel === "EMAIL"
      ? await prisma.emailTemplate.findFirst({ where: { id: templateId, isActive: true, audience: { in: ["LEAD", "GENERAL"] } } })
      : await prisma.notificationTemplate.findFirst({ where: { id: templateId, isActive: true, channel: "SMS", audience: { in: ["LEAD", "GENERAL"] } } });
    if (!template) return { ok: false, error: "This template is no longer available. Please choose another template." };
    if ("interestType" in template && template.interestType && current.recipients.some(row => row.interestType !== template.interestType)) {
      return { ok: false, error: "This template is for a different lead type. Update the filters or choose a suitable template." };
    }
    if (template.ctaUrlKey === "teamConfirmationUrl" && current.recipients.some(row => row.interestType !== "TEAM")) {
      return { ok: false, error: "Team decision emails can only be sent to team enquiries." };
    }
    const safe = prepareLeadCampaignSend(data, filters, ids);
    safe.set("templateId", template.id);
    safe.set("templateKey", template.key);
    safe.set("ctaLabel", template.ctaLabel || "");
    safe.set("ctaUrlKey", template.ctaUrlKey || "");
    safe.set("templateCtaUrlKey", template.ctaUrlKey || "");
    // Do not invent another delivery engine. This preserves existing personalised
    // decision links, suppression checks, confirmation limits and message history.
    const result = channel === "EMAIL"
      ? await sendBulkLeadEmailAction({}, safe)
      : await sendBulkLeadSmsAction({}, safe);
    revalidatePath("/admin/messaging");
    return result;
  } catch (error) {
    console.error("Comms lead campaign failed", error instanceof Error ? error.name : "Unknown error");
    return { ok: false, error: "The campaign could not be completed. Check the message history before retrying, and refresh the recipient list." };
  }
}
