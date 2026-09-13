import { createHmac, timingSafeEqual } from "node:crypto";
export const CUP_MAIL_SOURCES = ["CUP_INTEREST_INVITATION", "CUP_INTEREST_REMINDER"] as const;
export type CupResponse = "PENDING" | "YES" | "NO";
export type CupMailKind = "INITIAL" | "REMINDER";
export type CupTerms = {
  cupName: string; cupFormat: string; matchFeePence: number;
  venueNote: string; scheduleNote: string; responseDeadline: string;
};
export class CupInvitationError extends Error {}
export function money(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(pence / 100);
}
export function cupDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Not yet";
}
function secret() {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) throw new CupInvitationError("Cup response links are not configured.");
  return key;
}
function signature(payload: string) { return createHmac("sha256", secret()).update(`sixfl-cup-interest-v1:${payload}`).digest(); }
export function cupResponseToken(messageId: string, deadline: Date | string) {
  const payload = Buffer.from(JSON.stringify({ messageId, expires: new Date(deadline).getTime() })).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function readCupResponseToken(token: string, now = Date.now()) {
  try {
    if (token.length > 1024) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error();
    const actual = Buffer.from(parts[1], "base64url"), expected = signature(parts[0]);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    if (typeof value.messageId !== "string" || !Number.isFinite(value.expires) || value.expires <= now) throw new Error();
    return value as { messageId: string; expires: number };
  } catch { throw new CupInvitationError("This invitation link is invalid or has expired. Please contact SIXFL."); }
}
export function responseLabel(value: string) {
  return ({ YES: "Yes — interested", NO: "No — not this time", PENDING: "Awaiting response", NOT_INVITED: "Not invited", OUTDATED: "Details changed — re-invite" } as Record<string,string>)[value] || value;
}
export function summaryCounts(rows: Array<{ response: string; entered: boolean; deliveryProblem: boolean }>) {
  return { invited: rows.filter(r => r.response !== "NOT_INVITED").length,
    yes: rows.filter(r => r.response === "YES").length, no: rows.filter(r => r.response === "NO").length,
    pending: rows.filter(r => r.response === "PENDING").length, outdated: rows.filter(r => r.response === "OUTDATED").length,
    entrants: rows.filter(r => r.entered).length, problems: rows.filter(r => r.deliveryProblem).length };
}
export function filterCupRows<T extends { teamName: string; sourceLeagueId: string | null; response: string; deliveryProblem: boolean }>(rows: T[], filters: { q?: string; league?: string; response?: string }) {
  return rows.filter(r => (!filters.q || r.teamName.toLowerCase().includes(filters.q.toLowerCase())) &&
    (!filters.league || r.sourceLeagueId === filters.league) &&
    (!filters.response || (filters.response === "PROBLEM" ? r.deliveryProblem : r.response === filters.response)));
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
