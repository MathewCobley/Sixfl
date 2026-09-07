/** Shared by the worker, delivery gate and read-only status panel. */
export const REGISTRATION_SOURCE = "MANAGED_SQUAD_REGISTRATION_REMINDER";
export const REGISTRATION_PENDING_STATUSES = ["NEW", "CONTACTED", "TRIAL", "BACKUP"];
export const REGISTRATION_INVITE_SOURCE = "MANAGED_SQUAD_JOIN_CONFIRMATION";
export const REGISTRATION_LEGACY_CHASES = ["MANAGED_SQUAD_JOIN_CHASE", "MANAGED_SQUAD_JOIN_FINAL_CHASE"];
export const HOUR = 3_600_000;
export const REGISTRATION_DELAYS = [24 * HOUR, 72 * HOUR, 168 * HOUR];
export const REGISTRATION_GAPS = [0, 48 * HOUR, 96 * HOUR];
export type RegistrationChannel = "EMAIL" | "SMS";
export type RegistrationStage = 1 | 2 | 3;
export type RegistrationHistoryItem = {
  id: string; sourceType: string | null; status: string; channel: string;
  sentAt: Date | null; createdAt: Date; scheduledFor: Date;
  failureReason: string | null; metadata: unknown;
};
export type RegistrationPlan = {
  state: "waiting" | "paused" | "review" | "complete" | "scheduled" | "queued";
  note: string; stage: RegistrationStage | null; channel: RegistrationChannel | null; dueAt: Date | null;
};
export function registrationMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function registrationEnabled() {
  return Boolean(process.env.CRON_SECRET?.trim()) && process.env.MANAGED_SQUAD_REGISTRATION_REMINDERS_ENABLED?.trim().toLowerCase() !== "false";
}
export function registrationTemplateKey(stage: RegistrationStage, channel: RegistrationChannel) {
  return `managed-squad-registration-${stage === 3 ? "final" : "reminder"}-${channel.toLowerCase()}`;
}
/** UK morning is always outside the DST transition itself. Round-trip local
 * parts rather than adding 24h to a UTC morning across a clock change. */
export function nextRegistrationWindow(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour = n("hour");
  if (hour >= 9 && hour < 21) return date;
  const morningGuess = new Date(Date.UTC(n("year"), n("month") - 1, n("day") + (hour >= 21 ? 1 : 0), 9));
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(morningGuess));
  return new Date(morningGuess.getTime() - (localHour - 9) * HOUR);
}
export function registrationPlan(input: {
  inviteSentAt: Date | null; history: RegistrationHistoryItem[];
  emailAllowed: boolean; smsAllowed: boolean; lastManualContactAt: Date | null;
  pendingContact: boolean; blockedReason: string | null;
}): RegistrationPlan {
  const hold = (state: RegistrationPlan["state"], note: string): RegistrationPlan => ({ state, note, stage: null, channel: null, dueAt: null });
  if (input.blockedReason) return hold("paused", input.blockedReason);
  if (!input.inviteSentAt) return hold("waiting", "Waiting for a successfully sent squad activation invite for this team.");
  const history = [...input.history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const pending = history.find((d) => d.status === "QUEUED" || d.status === "PROCESSING");
  if (pending) return { ...hold("queued", pending.status === "PROCESSING" ? "Reminder is being processed; do not resend." : "Reminder queued, not yet sent."), dueAt: pending.scheduledFor };
  if (history.some((d) => d.status !== "SENT" || !d.sentAt)) return hold("review", "A previous reminder was not confirmed sent. Review the queue; no automatic retry.");
  const sent = history.filter((d) => d.status === "SENT" && d.sentAt);
  if (sent.some((d) => d.sourceType === "MANAGED_SQUAD_JOIN_FINAL_CHASE" || registrationMetadata(d.metadata).stage === 3) || sent.length >= 3) {
    return hold("complete", "Reminder sequence finished. No further automatic messages; review manually.");
  }
  if (input.pendingContact) return hold("waiting", "Another message is queued for this contact. Automatic reminders wait.");
  const stage = (sent.length + 1) as RegistrationStage;
  const preferred: RegistrationChannel = stage === 2 ? "EMAIL" : "SMS";
  const channel = preferred === "SMS"
    ? (input.smsAllowed ? "SMS" : input.emailAllowed ? "EMAIL" : null)
    : (input.emailAllowed ? "EMAIL" : input.smsAllowed ? "SMS" : null);
  if (!channel) return hold("paused", "No permitted contact channel. Check contact details and preferences.");
  const lastSent = Math.max(0, ...sent.map((d) => d.sentAt!.getTime()));
  const dueAt = nextRegistrationWindow(new Date(Math.max(
    input.inviteSentAt.getTime() + REGISTRATION_DELAYS[stage - 1],
    lastSent ? lastSent + REGISTRATION_GAPS[stage - 1] : 0,
    input.lastManualContactAt ? input.lastManualContactAt.getTime() + 48 * HOUR : 0,
  )));
  return { state: "scheduled", note: `Automatic reminder ${stage}/3 by ${channel}.`, stage, channel, dueAt };
}
