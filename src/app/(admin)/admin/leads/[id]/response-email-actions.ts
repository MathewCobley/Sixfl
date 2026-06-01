// ========================================
// File: src/app/(admin)/admin/leads/[id]/response-email-actions.ts
// ========================================

"use server";

import { sendLeadEmailAction } from "@/app/(admin)/admin/leads/[id]/actions";
import { buildLeadResponseUrls } from "@/lib/leads/responseLinks";

const YES_RESPONSE_TOKEN = "{{yesResponseUrl}}";
const NO_RESPONSE_TOKEN = "{{noResponseUrl}}";

function replaceLeadResponseTokens(value: string, leadId: string) {
  if (!value.includes(YES_RESPONSE_TOKEN) && !value.includes(NO_RESPONSE_TOKEN)) {
    return value;
  }

  const urls = buildLeadResponseUrls(leadId);

  return value
    .replaceAll(YES_RESPONSE_TOKEN, urls.yesResponseUrl)
    .replaceAll(NO_RESPONSE_TOKEN, urls.noResponseUrl);
}

export async function sendLeadEmailWithResponseLinksAction(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "").trim();

  if (!leadId) {
    return { ok: false, error: "Missing lead id." };
  }

  const nextFormData = new FormData();

  for (const [key, value] of formData.entries()) {
    if (key === "subject" || key === "body") {
      nextFormData.append(key, replaceLeadResponseTokens(String(value), leadId));
    } else {
      nextFormData.append(key, value);
    }
  }

  return sendLeadEmailAction(nextFormData);
}
