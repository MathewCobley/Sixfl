import { prisma } from "@/lib/prisma";

export const PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY = "player-pool-response-check-email";
// Keep the existing source identity so historical email and SMS stages remain linked.
export const PLAYER_POOL_PROFILE_REMINDER_SOURCE_TYPE = "PLAYER_POOL_PROFILE_NUDGE";

export type PlayerPoolProfileReminderTarget = {
  id: string;
  prospectId: string;
  profileToken: string;
  publicCode: string;
  status: string;
  profileSubmittedAt: Date | null;
  area: string | null;
  leagueId: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  leagueName: string | null;
};

export type QueuePlayerPoolProfileReminderResult =
  | {
      ok: true;
      displayName: string;
      dispatchStatus: string;
      recordedAt: Date;
    }
  | {
      ok: false;
      reason: "not_awaiting" | "missing_email" | "missing_profile_link";
      message: string;
    };

// Seeded by the idempotent migration and editable in System Templates.
// Reading the admin page must not overwrite administrator edits or send messages.
export async function ensurePlayerPoolProfileReminderTemplate() {
  return prisma.notificationTemplate.findUnique({ where: { key: PLAYER_POOL_PROFILE_REMINDER_TEMPLATE_KEY } });
}

export async function queuePlayerPoolProfileReminder(input: {
  profile: PlayerPoolProfileReminderTarget;
  createdByUserId?: string | null;
  origin: "player_pool_profile_nudge" | "player_pool_profile_bulk_reminder";
  originLabel: string;
  bulkRunId?: string | null;
}): Promise<QueuePlayerPoolProfileReminderResult> {
  const { queuePlayerPoolResponseCheck } = await import("./response-check");
  return queuePlayerPoolResponseCheck(input);
}
