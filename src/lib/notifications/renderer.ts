// ========================================
// File: src/lib/notifications/renderer.ts
// ========================================

export type NotificationTemplateVariables = Record<
  string,
  string | number | boolean | null | undefined
>;

const SAFE_EMPTY_PLACEHOLDERS = new Set(["pollOptions", "pollLink"]);

function normalizeValue(value: NotificationTemplateVariables[string]) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isTeamNameFirstNameFallback(input: {
  key: string;
  value: string;
  variables: NotificationTemplateVariables;
}) {
  if (input.key !== "firstName") return false;

  const firstName = input.value.trim().toLowerCase();
  const teamName = normalizeValue(input.variables.teamName).trim().toLowerCase();

  if (!firstName || !teamName) return false;
  if (firstName === teamName) return true;

  return teamName.startsWith(`${firstName} `);
}

function stripSafeEmptyPlaceholders(value: string) {
  let output = value;

  for (const key of SAFE_EMPTY_PLACEHOLDERS) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    output = output.replace(pattern, "");
  }

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

export function renderNotificationText(
  template: string,
  variables: NotificationTemplateVariables = {},
) {
  let output = template;

  for (const [key, rawValue] of Object.entries(variables)) {
    const rawNormalised = normalizeValue(rawValue);
    const value = isTeamNameFirstNameFallback({ key, value: rawNormalised, variables })
      ? "there"
      : rawNormalised;
    const pattern = new RegExp(`\\{\\{\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*\\}\\}`, "g");
    output = output.replace(pattern, value);
  }

  return stripSafeEmptyPlaceholders(output);
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
