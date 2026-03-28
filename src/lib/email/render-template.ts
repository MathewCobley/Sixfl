// ========================================
// File: src/lib/email/template-context.ts
// ========================================

export type EmailTemplateContextValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type EmailTemplateContext = Record<string, EmailTemplateContextValue>;

// ========================================
// Helpers
// ========================================

function normaliseString(value: EmailTemplateContextValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function getSafeFirstName(input?: string | null) {
  const trimmed = input?.trim() || "";
  return trimmed.split(/\s+/)[0] || "there";
}

// ========================================
// Public API
// ========================================

export function buildBaseEmailTemplateContext(input: {
  firstName?: string | null;
  fullName?: string | null;
  area?: string | null;
  signupUrl?: string | null;
  teamName?: string | null;
}) {
  const trimmedFullName = input.fullName?.trim() || "";
  const trimmedFirstName = input.firstName?.trim() || "";
  const safeFirstName =
    getSafeFirstName(trimmedFirstName) ||
    getSafeFirstName(trimmedFullName) ||
    "there";

  return {
    firstName: safeFirstName,
    name: trimmedFullName || safeFirstName,
    area: input.area?.trim() || "your area",
    signupUrl: input.signupUrl?.trim() || "",
    teamName: input.teamName?.trim() || "",
  };
}

export function mergeEmailTemplateContext(
  ...contexts: Array<EmailTemplateContext | null | undefined>
): EmailTemplateContext {
  return Object.assign({}, ...contexts.filter(Boolean));
}

export function resolveTemplateText(
  text: string,
  context: EmailTemplateContext
) {
  return text
    .replace(/{{\s*([\w.]+)\s*}}/g, (_, key: string) => {
      return normaliseString(context[key]);
    })
    .replace(/Hi there/gi, `Hi ${normaliseString(context.firstName) || "there"}`);
}