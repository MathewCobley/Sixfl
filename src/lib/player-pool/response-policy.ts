export const PLAYER_POOL_RESPONSE_TEMPLATE_KEY = "player-pool-still-looking-email";
export const PLAYER_POOL_REMINDER_SOURCE = "PLAYER_POOL_PROFILE_NUDGE";
export const PLAYER_POOL_CONTACT_SOURCES = [
  "PLAYER_POOL_PROFILE_INVITE", PLAYER_POOL_REMINDER_SOURCE,
  "PLAYER_POOL_PROFILE_SMS_NUDGE_1", "PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL",
];
export const PLAYER_POOL_CONTACT_COOLDOWN_MS = 48 * 60 * 60 * 1000;
export type ContactEvent = {
  id: string; kind: string; channel: string; status: string; at: Date;
  sentAt: Date | null; scheduledFor: Date | null; author: string | null;
  href: string | null; deliveryStatus: string | null;
};
export type ContactHistory = {
  events: ContactEvent[]; latestReplyAt: Date | null; latestSentAt: Date | null;
  pendingCount: number; emailBlocked: boolean; smsBlocked: boolean;
};
export const emptyContactHistory = (): ContactHistory => ({
  events: [], latestReplyAt: null, latestSentAt: null,
  pendingCount: 0, emailBlocked: false, smsBlocked: false,
});
export function playerPoolChaseBlock(
  profile: { status: string; profileSubmittedAt: Date | null; email: string | null;
    profileToken: string; prospectStatus?: string; hasSquadRecord?: boolean },
  history: ContactHistory, now = new Date(), channel: "EMAIL" | "SMS" = "EMAIL",
  delivery = false,
): string | null {
  if (profile.status !== "INVITED" || profile.profileSubmittedAt) return "No longer awaiting a profile.";
  if (["ACTIVE_SQUAD", "JOINED", "NOT_LOOKING", "DECLINED", "CLOSED", "DUPLICATE"].includes(profile.prospectStatus || "")) return "This prospect is no longer awaiting a team; review their record.";
  if (profile.hasSquadRecord) return "Existing squad record found; review before chasing.";
  if (!profile.profileToken.trim()) return "No secure profile link is available.";
  if (channel === "EMAIL" && (!profile.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim()))) return "No usable email address.";
  if (channel === "EMAIL" ? history.emailBlocked : history.smsBlocked) return "Contact is suppressed or has opted out of this channel.";
  if (history.latestReplyAt) return "A reply has been received; review Player comms before sending another chase.";
  if (!delivery && history.pendingCount > 0) return "A message is already queued or sending; no duplicate chase added.";
  if (!delivery && history.latestSentAt && now.getTime() - history.latestSentAt.getTime() < PLAYER_POOL_CONTACT_COOLDOWN_MS) return "Contacted within the last 48 hours; allow time to respond.";
  return null;
}
