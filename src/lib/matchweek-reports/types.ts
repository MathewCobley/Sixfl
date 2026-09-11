export type ReportMatch = {
  fixtureId: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  scorers: Array<{ team: string; name: string; goals: number }>;
  playersOfMatch: Array<{ team: string; name: string }>;
};
/** Admin-only explanation of a published fixture excluded from the article. */
export type ReportSkippedFixture = {
  fixtureId: string;
  teamA: string;
  teamB: string;
  kickoffAt: string;
  disposition: "pending" | "omitted";
  reasons: Array<{ code: string; message: string }>;
};
export type ReportSource = {
  leagueId: string;
  leagueName: string;
  area: string | null;
  matchDate: string;
  matches: ReportMatch[];
  omittedFixtures: number;
  pendingFixtures: number;
  warnings: string[];
  // Older saved snapshots have only the counts. Fresh reads always include this.
  // Never send administrative reasons to the article-writing provider.
  skippedFixtures?: ReportSkippedFixture[];
};
export type ReportContent = {
  title: string;
  introduction: string;
  matches: Array<{ fixtureId: string; paragraph: string }>;
  closing: string;
};
export type ReportDraft = {
  id: string;
  version: number;
  content: ReportContent | null;
  source: ReportSource | null;
  sourceHash: string | null;
  model: string | null;
  updatedAt: string;
};
export type ReportView = {
  source: ReportSource;
  sourceHash: string;
  draft: ReportDraft | null;
  configured: boolean;
  model: string;
  stale: boolean;
  generating: boolean;
  latestError: string | null;
};
export class ReportError extends Error {
  constructor(message: string, public status = 400) { super(message); this.name = "ReportError"; }
}
export function validDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ReportError("Choose a valid match date.");
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ReportError("Choose a valid match date.");
  return value;
}
export function validateContent(value: unknown, source: ReportSource): ReportContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReportError("The report could not be read.");
  const obj = value as Record<string, unknown>;
  const text = (key: string, max: number, empty = false) => {
    const v = obj[key];
    if (typeof v !== "string" || v.length > max || (!empty && !v.trim())) throw new ReportError(`The report ${key} is missing or too long.`);
    return v.trim();
  };
  const title = text("title", 180), introduction = text("introduction", 3500), closing = text("closing", 2000, true);
  if (!Array.isArray(obj.matches) || obj.matches.length !== source.matches.length) throw new ReportError("The report does not cover the selected matches correctly.");
  const expected = new Set(source.matches.map(m => m.fixtureId));
  const matches = obj.matches.map((row: unknown) => {
    if (!row || typeof row !== "object") throw new ReportError("Invalid match paragraph.");
    const m = row as Record<string, unknown>;
    if (typeof m.fixtureId !== "string" || !expected.delete(m.fixtureId) || typeof m.paragraph !== "string" || !m.paragraph.trim() || m.paragraph.length > 3500) throw new ReportError("The report contains missing or duplicate matches.");
    return { fixtureId: m.fixtureId, paragraph: m.paragraph.trim() };
  });
  return { title, introduction, matches, closing };
}
