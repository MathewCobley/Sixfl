// ========================================
// File: src/app/(admin)/admin/leads/[id]/response-email-actions.ts
// ========================================

"use server";

import { sendLeadEmailAction } from "@/app/(admin)/admin/leads/[id]/actions";
import { buildLeadResponseUrls } from "@/lib/leads/responseLinks";

const YES_RESPONSE_TOKEN = "{{yesResponseUrl}}";
const NO_RESPONSE_TOKEN = "{{noResponseUrl}}";

function replaceLeadResponseTokens(value: string, leadId: string) {
  const urls = buildLeadResponseUrls(leadId);

  return value
    .replaceAll(YES_RESPONSE_TOKEN, urls.yesResponseUrl)
    .replaceAll(NO_RESPONSE_TOKEN, urls.noResponseUrl)
    .replace(
      /(YES,\s*I still want to play:)\s*(?:\n|$)/i,
      `$1 ${urls.yesResponseUrl}\n`,
    )
    .replace(
      /(NO,\s*remove me from the squad list:)\s*(?:\n|$)/i,
      `$1 ${urls.noResponseUrl}\n`,
    );
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
