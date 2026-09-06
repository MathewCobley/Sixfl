/** Shared result and saved-value comparison; validation remains in the existing actions. */
export type TemplateSaveOptions = {
  channel: "EMAIL" | "SMS";
  templateType: "campaign" | "system";
  mode: "create" | "edit";
};
export type TemplateSaveState = {
  ok?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
  redirectTo?: string;
  existingUrl?: string;
  needsCheck?: boolean;
  signInRequired?: boolean;
};
export function templateKey(data: FormData) {
  return String(data.get("key") || data.get("name") || "").trim().toLowerCase()
    .replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function matchesSavedTemplate(saved: Record<string, unknown>, data: FormData, options: TemplateSaveOptions) {
  const value = (key: string) => String(data.get(key) ?? "").trim();
  const expected: Record<string, unknown> = {
    key: templateKey(data), name: value("name"), description: value("description") || null,
    audience: value("audience").toUpperCase(), body: value("body"),
    ctaUrlKey: value("ctaUrlKey") || null,
    isActive: data.get("isActive") === "true" || data.get("isActive") === "on",
  };
  if (options.channel === "EMAIL") {
    expected.subject = value("subject"); expected.ctaLabel = value("ctaLabel") || null;
    if (options.templateType === "campaign") expected.interestType = value("interestType").toUpperCase() || null;
  }
  if (options.channel === "SMS" || options.templateType === "system") {
    expected.channel = options.channel;
    expected.kind = options.templateType === "system" ? "TRANSACTIONAL" : "CAMPAIGN";
  }
  return Object.entries(expected).every(([key, expectedValue]) => saved[key] === expectedValue);
}
export function savedTemplateResult(id: string, mode: "create" | "edit"): TemplateSaveState {
  return {
    ok: true, success: true,
    message: mode === "create" ? "Template saved successfully." : "Changes saved successfully.",
    ...(mode === "create" ? { redirectTo: `/admin/templates/${encodeURIComponent(id)}?created=1` } : {}),
  };
}
export function safeTemplateUrl(value?: string) {
  return value && /^\/admin\/templates\/[A-Za-z0-9_-]+(?:\?created=1)?$/.test(value) ? value : undefined;
}
