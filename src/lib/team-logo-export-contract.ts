export const MAX_LOGO_EXPORT_TEAMS = 200;
export const MAX_LOGO_EXPORT_BYTES = 64 * 1024 * 1024;
export type TeamLogoExportChoice = {
  id: string;
  name: string;
  logoUrl: string | null;
  leagueKey: string;
  leagueName: string;
  season: string | null;
  isCurrent: boolean;
};

export function parseLogoTeamIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_LOGO_EXPORT_TEAMS ||
      value.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
    throw new Error(`Select between 1 and ${MAX_LOGO_EXPORT_TEAMS} teams.`);
  }
  return [...new Set(value as string[])];
}

/** A single portable filename segment, never a path supplied by a team name. */
export function logoFileSegment(value: string, fallback = "Team") {
  const cleaned = value.normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/g, "-")
    .replace(/\s+/g, " ").replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).trim().replace(/[. ]+$/g, "");
  const name = cleaned || fallback;
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) ? `_${name}` : name;
}
