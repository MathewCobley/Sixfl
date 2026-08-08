"use server";

import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
} from "@prisma/client";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";

const CAMPAIGN_KEY = "goal-of-week-player-vote-launch-2026-08";

export type GoalOfWeekAnnouncementRecipient = {
  userId: string;
  email: string;
  name: string | null;
};

export async function getGoalOfWeekAnnouncementRecipients() {
  const rows = await prisma.$queryRaw<GoalOfWeekAnnouncementRecipient[]>`
    SELECT DISTINCT
      users."id" AS "userId",
      users."email" AS "email",
      users."name" AS "name"
    FROM "User" users
    WHERE users."email" IS NOT NULL
      AND TRIM(users."email") <> ''
      AND (
        EXISTS (
          SELECT 1
          FROM "TeamMember" membership
          INNER JOIN "LeagueSeasonTeam" season_team
            ON season_team."teamId" = membership."teamId"
           AND season_team."isActive" = TRUE
          WHERE membership."userId" = users."id"
        )
        OR EXISTS (
          SELECT 1
          FROM "Team" team
          INNER JOIN "LeagueSeasonTeam" season_team
            ON season_team."teamId" = team."id"
           AND season_team."isActive" = TRUE
          WHERE team."captainUserId" = users."id"
        )
      )
    ORDER BY users."email" ASC
  `;

  return rows.map((row) => ({
    ...row,
    email: row.email.trim().toLowerCase(),
  }));
}

function firstName(value: string | null) {
  return value?.trim().split(/\s+/)[0]?.trim() || "there";
}

export async function sendGoalOfWeekLaunchAnnouncementAction() {
  const admin = await requireAdmin();
  const recipients = await getGoalOfWeekAnnouncementRecipients();
  const dashboardUrl = `${getPublicSiteUrl()}/dashboard`;

  let queued = 0;
  let skipped = 0;
  let alreadyQueued = 0;
  let failed = 0;

  for (const person of recipients) {
    try {
      const existingRecipient = await prisma.notificationRecipient.findFirst({
        where: {
          sourceType: NotificationRecipientSourceType.USER,
          sourceId: person.userId,
        },
        include: { preferences: true },
      });

      const recipient = await upsertNotificationRecipient({
        sourceType: NotificationRecipientSourceType.USER,
        sourceId: person.userId,
        audience: NotificationAudience.USER,
        displayName: person.name,
        email: person.email,
        marketingEmailOptIn: existingRecipient?.marketingEmailOptIn ?? false,
        marketingSmsOptIn: existingRecipient?.marketingSmsOptIn ?? false,
        transactionalEmailOptIn: existingRecipient?.transactionalEmailOptIn ?? true,
        transactionalSmsOptIn: existingRecipient?.transactionalSmsOptIn ?? true,
        metadata: {
          ...(existingRecipient?.metadata && typeof existingRecipient.metadata === "object" && !Array.isArray(existingRecipient.metadata)
            ? existingRecipient.metadata
            : {}),
          goalOfWeekLaunchAudience: true,
        },
      });

      const duplicate = await prisma.notificationDispatch.findFirst({
        where: {
          recipientId: recipient.id,
          sourceType: "GOAL_OF_WEEK",
          sourceId: CAMPAIGN_KEY,
        },
        select: { id: true },
      });

      if (duplicate) {
        alreadyQueued += 1;
        continue;
      }

      const dispatch = await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.USER,
        subject: "Goal of the Week is now yours to decide ⚽",
        body: [
          "Hi {{firstName}},",
          "",
          "SIXFL Goal of the Week is changing — the players now choose it.",
          "",
          "After a recorded SIXFL TV match, players and captains can nominate the goals they think deserve to be in the running. If more than one person picks the same goal, those nominations are combined.",
          "",
          "The six most-nominated goals go into the following week's ballot. Every verified SIXFL player and captain gets one vote, and you can change your choice until voting closes.",
          "",
          "You will now see a Goal of the Week card on your SIXFL dashboard whenever there is something to nominate or a vote is open.",
          "",
          "{{cta}}",
          "",
          "So if somebody scores an absolute worldie, don't just talk about it — nominate it. And when the shortlist opens, you decide the winner.",
        ].join("\n"),
        variables: {
          firstName: firstName(person.name),
        },
        emailCta: {
          label: "Open my SIXFL dashboard",
          url: dashboardUrl,
        },
        isTransactional: true,
        sourceType: "GOAL_OF_WEEK",
        sourceId: CAMPAIGN_KEY,
        metadata: {
          purpose: "Goal of the Week player-vote launch",
          campaignKey: CAMPAIGN_KEY,
          userId: person.userId,
        },
        createdByUserId: admin.user?.id ?? null,
      });

      if (dispatch.status === "SKIPPED" || dispatch.status === "CANCELLED") {
        skipped += 1;
      } else {
        queued += 1;
      }
    } catch (error) {
      console.error("Goal of the Week launch announcement failed", {
        userId: person.userId,
        error,
      });
      failed += 1;
    }
  }

  redirect(
    `/admin/sixfl-tv/goal-of-week/announcement?sent=1&queued=${queued}&skipped=${skipped}&already=${alreadyQueued}&failed=${failed}`,
  );
}
