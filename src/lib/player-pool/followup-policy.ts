// One auditable response request per existing PlayerPool profile. Ordinary
// profile invitations/reminders remain separate, and silence is never a refusal.
export const RESPONSE_CHASE_SOURCE = "PLAYER_POOL_RESPONSE_CHASE";
export const RESPONSE_CHASE_TEMPLATE = "player-pool-response-chase-email";
export const PROFILE_CONTACT_SOURCES = [
  "PLAYER_POOL_PROFILE_INVITE", "PLAYER_POOL_PROFILE_NUDGE",
  "PLAYER_POOL_PROFILE_SMS_NUDGE_1", "PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL",
  RESPONSE_CHASE_SOURCE,
];
export const CONTACT_COOLDOWN_MS = 48 * 60 * 60 * 1000;
export type ContactEvent = {
  id: string; kind: string; channel: string; status: string; at: string;
  sentAt: string | null; scheduledFor: string | null; by: string; threadId?: string;
};
export type FollowupState = {
  id: string; prospectId: string; profileToken: string; publicCode: string;
  status: string; profileSubmittedAt: Date | null; invitedAt: Date | null;
  createdAt: Date; firstName: string; email: string | null; phone: string | null;
  emailMatches: boolean; hasSquadRecord: boolean; hasIntroduction: boolean;
  emailBlocked: boolean; smsBlocked: boolean; latestReplyAt: Date | null;
  replyThreadId: string | null; declinedAt: Date | null; events: ContactEvent[];
};
export function followupBlock(state: FollowupState, now = new Date()): string | null {
  if (state.status !== "INVITED" || state.profileSubmittedAt) return "No longer awaiting a profile";
  if (state.declinedAt) return "Player said no — enquiry closed";
  if (state.hasSquadRecord || state.hasIntroduction) return "Squad or introduction record exists — review first";
  if (state.latestReplyAt) return "Reply already received — review Player comms first";
  if (!state.email?.trim()) return "No email address";
  if (!state.emailMatches) return "Email identity changed — review first";
  if (!state.profileToken?.trim()) return "No active profile link";
  if (state.emailBlocked) return "Email disabled or contact opted out";
  if (state.events.some(e => e.kind === RESPONSE_CHASE_SOURCE)) return "Response request already recorded — not sent again";
  if (state.events.some(e => ["QUEUED", "PROCESSING"].includes(e.status))) return "A PlayerPool message is already queued or sending";
  const sentTimes = state.events.flatMap(e => e.sentAt ? [new Date(e.sentAt).getTime()] : []);
  // An invitation timestamp is NOT proof of delivery, but avoid chasing a
  // newly invited player merely because legacy delivery evidence is absent.
  if (state.invitedAt) sentTimes.push(new Date(state.invitedAt).getTime());
  if (sentTimes.some(t => Number.isFinite(t) && now.getTime() - t < CONTACT_COOLDOWN_MS)) return "Contact recorded within 48 hours — give them time to respond";
  return null;
}
export function safeFollowupSummary(state: FollowupState, now = new Date()) {
  return { profileId: state.id, publicCode: state.publicCode, reason: followupBlock(state, now) };
}
