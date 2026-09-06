import { NextRequest, NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { createEmailTemplateAction, updateEmailTemplateAction } from "@/app/(admin)/admin/email-templates/actions";
import { createSystemEmailTemplateAction, updateSystemEmailTemplateAction } from "@/app/(admin)/admin/system-email-templates/actions";
import { createSmsTemplateAction, updateSmsTemplateAction, createSystemSmsTemplateAction, updateSystemSmsTemplateAction } from "@/app/(admin)/admin/sms-templates/actions";
import { matchesSavedTemplate, savedTemplateResult, templateKey, type TemplateSaveOptions, type TemplateSaveState } from "@/lib/templates/save-contract";

export const dynamic = "force-dynamic";
function json(state: TemplateSaveState, status = 200) {
  return NextResponse.json(state, { status, headers: { "Cache-Control": "no-store" } });
}

/** JSON acknowledges the mutation without waiting for a revalidated admin page's RSC payload. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(), request.nextUrl.host];
  let sameOrigin = false;
  try { sameOrigin = Boolean(origin && hosts.includes(new URL(origin).host)); } catch { /* reject malformed origin */ }
  if (!sameOrigin || request.headers.get("x-sixfl-template-request") !== "1") {
    return json({ ok: false, error: "This save request is not allowed." }, 403);
  }
  let data: FormData | undefined;
  let options: TemplateSaveOptions | undefined;
  try {
    // Also retained inside the shared actions: no client-provided role or bypass.
    await requireAdmin();
    data = await request.formData();
    const channel = data.get("channel"), templateType = data.get("templateType"), mode = data.get("mode"), operation = data.get("operation");
    if ((channel !== "EMAIL" && channel !== "SMS") || (templateType !== "campaign" && templateType !== "system") ||
        (mode !== "create" && mode !== "edit") || (operation !== "save" && operation !== "check")) {
      return json({ ok: false, error: "Invalid template save request." }, 400);
    }
    options = { channel, templateType, mode };
    const existing = await findSaved(data, options);
    if (existing && matchesSavedTemplate(existing, data, options)) return json(savedTemplateResult(existing.id, mode));
    if (operation === "check") {
      return json({ ok: false, needsCheck: false, error: "No matching saved version was found yet. Your text is still here. You can retry using the same template key; an existing template with that key will not be overwritten by creation." });
    }
    if (mode === "create" && existing) return conflict(existing.id);
    if (mode === "edit" && (!existing || ("channel" in existing && (existing.channel !== channel || existing.kind !== (templateType === "system" ? "TRANSACTIONAL" : "CAMPAIGN"))))) {
      return json({ ok: false, error: "The template was not found in this channel and type. Reload its editor before saving." }, 404);
    }
    const actions = channel === "EMAIL"
      ? templateType === "system" ? [createSystemEmailTemplateAction, updateSystemEmailTemplateAction] : [createEmailTemplateAction, updateEmailTemplateAction]
      : templateType === "system" ? [createSystemSmsTemplateAction, updateSystemSmsTemplateAction] : [createSmsTemplateAction, updateSmsTemplateAction];
    const result = await actions[mode === "create" ? 0 : 1](data);
    if (result.ok && mode === "create" && result.redirectTo) {
      return json({ ...result, message: "Template saved successfully.", redirectTo: `${result.redirectTo.split("?")[0]}?created=1` });
    }
    return json(result, result.ok ? 200 : 422);
  } catch (error) {
    if (isRedirectError(error)) {
      const signInRequired = getURLFromRedirectError(error)?.startsWith("/login") ?? false;
      return json({ ok: false, signInRequired, needsCheck: signInRequired,
        error: signInRequired ? "Your sign-in has expired. Your text is still here. Sign in in another tab, then check save status." : "Administrator access is required." }, signInRequired ? 401 : 403);
    }
    // A unique-key race or a lost response after commit is recovered by exact saved values,
    // never by blindly creating a second template or overwriting someone else's version.
    if (data && options) {
      try {
        const saved = await findSaved(data, options);
        if (saved && matchesSavedTemplate(saved, data, options)) return json(savedTemplateResult(saved.id, options.mode));
        if (saved && options.mode === "create") return conflict(saved.id);
      } catch { /* database may be unavailable; preserve the unknown outcome */ }
    }
    console.error("[template-save] Save outcome could not be confirmed", { code: (error as { code?: string })?.code ?? "UNKNOWN" });
    return json({ ok: false, needsCheck: true, error: "The save could not be confirmed. Your text is still here. Check save status before trying again." }, 500);
  }
}
function conflict(id: string) {
  return json({ ok: false, errors: { key: ["A different template already uses this key."] },
    error: "A different template already uses this key. Open the existing template or choose another key.", existingUrl: `/admin/templates/${encodeURIComponent(id)}` }, 409);
}
async function findSaved(data: FormData, options: TemplateSaveOptions) {
  const where = options.mode === "edit" ? { id: String(data.get("id") ?? "").trim() } : { key: templateKey(data) };
  return options.channel === "EMAIL" && options.templateType === "campaign"
    ? prisma.emailTemplate.findUnique({ where }) : prisma.notificationTemplate.findUnique({ where });
}
