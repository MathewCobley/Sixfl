/** Registration follow-ups only: never payments, operational messages or inbox replies. */
export const TEAM_LEAD_CHASE_SOURCES = [
  "LEAD_REASSURANCE_EMAIL", "LEAD_LIVE_LEAGUE_REASSURANCE_EMAIL", "LEAD_REASSURANCE_SMS",
  "LEAD_TEAM_CONFIRMATION", "LEAD_TEAM_CONFIRMATION_CHASE",
  "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_1", "LEAD_TEAM_CONFIRMATION_SMS_NUDGE_FINAL",
] as const;
export const TEAM_LEAD_CHASE_TEMPLATES = [
  "team-lead-reassurance-email", "team-lead-reassurance-live-email", "team-lead-reassurance-sms",
  "team-place-confirmation-email", "team-place-confirmation-chase-email",
  "team-lead-confirmation-sms-nudge", "team-lead-confirmation-sms-final-nudge",
] as const;
export const TEAM_LEAD_STOP_REASON = "Team lead is not interested or closed — registration follow-ups stopped.";
export type LeadChaseReference = {
  sourceType?: string | null;
  sourceId?: string | null;
  templateKey?: string | null;
  template?: { key?: string | null; ctaUrlKey?: string | null } | null;
  metadata?: unknown;
};
export function teamLeadChaseId(input: LeadChaseReference): string | null {
  const source = input.sourceType?.trim() || "";
  const id = input.sourceId?.trim() || "";
  if (!id) return null;
  if ((TEAM_LEAD_CHASE_SOURCES as readonly string[]).includes(source)) return id;
  if (source !== "LEAD") return null;
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown> : {};
  const key = input.templateKey || input.template?.key || metadata.templateKey;
  if (typeof key === "string" && (TEAM_LEAD_CHASE_TEMPLATES as readonly string[]).includes(key)) return id;
  if (input.template?.ctaUrlKey === "teamConfirmationUrl" || metadata.ctaUrlKey === "teamConfirmationUrl") return id;
  return typeof metadata.ctaUrl === "string" && metadata.ctaUrl.includes("/team-confirmation/") ? id : null;
}
