export const DEFAULT_TEAM_KIT_COLOUR = "#64748B";

export function normaliseTeamKitColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}
