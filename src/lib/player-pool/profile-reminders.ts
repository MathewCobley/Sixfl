import { prisma } from "@/lib/prisma";
import { queuePlayerPoolResponseReminder } from "./response-reminders";
import { PLAYER_POOL_RESPONSE_TEMPLATE_KEY } from "./response-policy";
import type { PlayerPoolContactTarget } from "./contact-history";

// Preserve the historical source type so earlier chases still appear and the
// existing first/final SMS sequence is not reset by the new response email.
export const PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE = "PLAYER_POOL_PROFILE_NUDGE";
export const PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY = PLAYER_POOL_RESPONSE_TEMPLATE_KEY;
export type PlayerPoolProfileReminderTarget = Pick<PlayerPoolContactTarget,
  "id" | "prospectId" | "profileToken" | "publicCode" | "status" | "profileSubmittedAt" |
  "area" | "leagueId" | "firstName" | "lastName" | "email" | "phone" | "leagueName">;

// Seeded by an idempotent migration, editable in System Templates. Never replace
// an administrator's template edits while opening the page or sending a chase.
export async function ensurePlayerPoolProfileReminderTemplate() {
  return prisma.notificationTemplate.findUnique({ where: { key: PLAYER_POOL_RESPONSE_TEMPLATE_KEY } });
}
export async function queuePlayerPoolProfileReminder(input: {
  profile: PlayerPoolProfileReminderTarget; createdByUserId?: string | null;
  origin: "player_pool_profile_nudge" | "player_pool_profile_bulk_reminder";
  originLabel: string; bulkRunId?: string | null;
}) {
  return queuePlayerPoolResponseReminder({ ...input, profileId: input.profile.id });
}
