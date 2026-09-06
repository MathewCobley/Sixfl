import { normalizePhoneNumber } from "@/lib/notifications/phone";

export const PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE = "PLAYER_POOL_PROFILE_SMS_NUDGE_1";
export const PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE = "PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL";
export const PLAYER_POOL_PROFILE_SMS_SOURCES = [PLAYER_POOL_PROFILE_SMS_FIRST_SOURCE_TYPE, PLAYER_POOL_PROFILE_SMS_FINAL_SOURCE_TYPE];
export const PLAYER_POOL_PROFILE_SMS_TEMPLATE_KEYS = {
  first: "player-pool-profile-first-chase-sms",
  final: "player-pool-profile-final-chase-sms",
} as const;
// Keep the existing first chase timing; the second waits for the actual first send.
export const FIRST_SMS_DELAY_MS = 48 * 60 * 60 * 1000;
export const FINAL_SMS_DELAY_MS = 48 * 60 * 60 * 1000;
export type ProfileSmsStage = "first" | "final";
export type ProfileSmsDispatch = {
  id: string;
  status: string;
  createdAt: Date;
  scheduledFor: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
};
export type ProfileSmsHistory = {
  emailSentAt: Date | null;
  first: ProfileSmsDispatch | null;
  final: ProfileSmsDispatch | null;
  blockedReason: string | null;
};
export function emptyProfileSmsHistory(): ProfileSmsHistory {
  return { emailSentAt: null, first: null, final: null, blockedReason: null };
}
export function isPlayerPoolProfileSms(sourceType: string | null | undefined) {
  return Boolean(sourceType && PLAYER_POOL_PROFILE_SMS_SOURCES.includes(sourceType));
}
export function profileSmsPlan(profile: { status: string; profileSubmittedAt: Date | null; phone: string | null }, history: ProfileSmsHistory): {
  stage: ProfileSmsStage | null; dueAt: Date | null; note: string;
} {
  const stop = (note: string) => ({ stage: null, dueAt: null, note });
  if (profile.profileSubmittedAt) return stop("Profile completed — no further automatic SMS chases.");
  if (profile.status !== "INVITED") return stop("Not awaiting a profile — automatic SMS chases stopped.");
  if (history.final) return stop("Second/final chase recorded — no further automatic SMS chases.");
  if (!normalizePhoneNumber(profile.phone)) return stop("No valid mobile number — SMS chases cannot be sent.");
  if (history.blockedReason) return stop(history.blockedReason);
  if (!history.first) {
    if (!history.emailSentAt) return stop("Waiting for a profile reminder email to be sent before the first SMS chase.");
    return { stage: "first", dueAt: new Date(history.emailSentAt.getTime() + FIRST_SMS_DELAY_MS), note: "First SMS chase: 48 hours after the profile reminder email is sent." };
  }
  if (history.first.status !== "SENT" || !history.first.sentAt) {
    return stop("Second chase waits for a successfully sent first SMS. Failed, skipped or cancelled chases are not automatically retried.");
  }
  return { stage: "final", dueAt: new Date(history.first.sentAt.getTime() + FINAL_SMS_DELAY_MS), note: "Second/final SMS chase: 48 hours after the first SMS is sent, only while the profile is incomplete." };
}

// Legacy duplicate/cancelled attempts must not hide a successful send on the card.
export function preferredProfileSmsDispatch(current: ProfileSmsDispatch | null, incoming: ProfileSmsDispatch): ProfileSmsDispatch {
  const rank = (row: ProfileSmsDispatch) => row.status === "SENT" && row.sentAt ? 5 : row.status === "PROCESSING" ? 4 : row.status === "QUEUED" ? 3 : row.status === "FAILED" ? 2 : row.status === "SKIPPED" ? 1 : 0;
  if (!current || rank(incoming) > rank(current) || (rank(incoming) === rank(current) && incoming.createdAt > current.createdAt)) return incoming;
  return current;
}
