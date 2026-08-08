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
export const GOAL_OF_WEEK_LAUNCH_TEMPLATE_KEY = "goal-of-week-player-vote-launch";

export type GoalOfWeekAnnouncementRecipient = {
  userId: string;
  email: string;
  name: string | null;
};

export async function getGoalOfWeekLaunchTemplate() {
  return prisma.emailTemplate.findUnique({
    where: { key: GOAL_OF_WEEK_LAUNCH_TEMPLATE_KEY },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      subject: true,
      body: true,
      ctaLabel: true,
      ctaUrlKey: true,
      isActive: true,
      updatedAt: true,
    },
  });
}

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
  const [recipients, template] = await Promise.all([
    getGoalOfWeekAnnouncementRecipients(),
    getGoalOfWeekLaunchTemplate(),
  ]);

  if (!template) {
    redirect("/admin/sixfl-tv/goal-of-week/announcement?template=missing");
  }

  if (!template.isActive) {
    redirect("/admin/sixfl-tv/goal-of-week/announcement?template=inactive");
  }

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
          ...(existingRecipient?.metadata &&
          typeof existingRecipient.metadata === "object" &&
          !Array.isArray(existingRecipient.metadata)
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
        subject: template.subject,
        body: template.body,
        variables: {
          firstName: firstName(person.name),
          captainDashboardUrl: dashboardUrl,
        },
        emailCta: template.ctaLabel
          ? {
              label: template.ctaLabel,
              url: dashboardUrl,
            }
          : undefined,
        isTransactional: true,
        sourceType: "GOAL_OF_WEEK",
        sourceId: CAMPAIGN_KEY,
        metadata: {
          purpose: "Goal of the Week player-vote launch",
          campaignKey: CAMPAIGN_KEY,
          emailTemplateKey: template.key,
          emailTemplateId: template.id,
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
