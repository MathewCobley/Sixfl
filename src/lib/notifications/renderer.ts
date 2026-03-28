// ========================================
// File: src/lib/notifications/renderer.ts
// ========================================

export type NotificationTemplateVariables = Record<
  string,
  string | number | boolean | null | undefined
>;

function normalizeValue(value: NotificationTemplateVariables[string]) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function renderNotificationText(
  template: string,
  variables: NotificationTemplateVariables = {},
) {
  let output = template;

  for (const [key, rawValue] of Object.entries(variables)) {
    const value = normalizeValue(rawValue);
    const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\}\\}`, "g");
    output = output.replace(pattern, value);
  }

  return output;
}

export function extractNotificationTokens(template: string) {
  const tokens = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

  for (const match of template.matchAll(pattern)) {
    const token = match[1]?.trim();
    if (token) tokens.add(token);
  }

  return Array.from(tokens).sort((a, b) => a.localeCompare(b));
}
