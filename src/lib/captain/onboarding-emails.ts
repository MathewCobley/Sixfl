// ========================================
// File: src/lib/captain/onboarding-emails.ts
// ========================================

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";

type CaptainOnboardingEmailRow = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  secondaryContactEmail: string | null;
  captainName: string | null;
  captainEmail: string | null;
  captainAgreementAcceptedAt: Date | null;
  onboardingWelcomeEmailSentAt: Date | null;
  onboardingFirstFixtureEmailSentAt: Date | null;
  onboardingPostFirstMatchEmailSentAt: Date | null;
  nextFixtureAt: Date | null;
  hasCompletedMatch: boolean;
};

export type CaptainOnboardingEmailJobSummary = {
  scannedTeams: number;
  queuedDispatches: number;
  skippedNoEmail: number;
  alreadySentOrNotDue: number;
  schemaReady: boolean;
  errors: string[];
};

type OnboardingEmailStage = "welcome" | "firstFixture" | "postFirstMatch";

const TEMPLATE_KEYS: Record<OnboardingEmailStage, string> = {
  welcome: "captain-onboarding-welcome",
  firstFixture: "captain-first-fixture-reminder",
  postFirstMatch: "captain-post-first-match",
};

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getCaptainName(row: CaptainOnboardingEmailRow) {
  return row.captainName?.trim() || row.contactName?.trim() || "Captain";
}

function getCaptainEmail(row: CaptainOnboardingEmailRow) {
  return (
    row.captainEmail?.trim() ||
    row.contactEmail?.trim() ||
    row.secondaryContactEmail?.trim() ||
    null
  );
}

function shouldQueueStage(input: {
  row: CaptainOnboardingEmailRow;
  stage: OnboardingEmailStage;
  now: Date;
}) {
  const sevenDaysFromNow = new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000);

  switch (input.stage) {
    case "welcome":
      return !input.row.onboardingWelcomeEmailSentAt;
    case "firstFixture":
      return Boolean(
        input.row.nextFixtureAt &&
          input.row.nextFixtureAt <= sevenDaysFromNow &&
          !input.row.onboardingFirstFixtureEmailSentAt,
      );
    case "postFirstMatch":
      return input.row.hasCompletedMatch && !input.row.onboardingPostFirstMatchEmailSentAt;
    default:
      return false;
  }
}

async function markStageQueued(input: {
  teamId: string;
  stage: OnboardingEmailStage;
}) {
  switch (input.stage) {
    case "welcome":
      await prisma.$executeRaw`
        UPDATE "Team"
        SET "onboardingWelcomeEmailSentAt" = COALESCE("onboardingWelcomeEmailSentAt", NOW())
        WHERE "id" = ${input.teamId}
      `;
      return;
    case "firstFixture":
      await prisma.$executeRaw`
        UPDATE "Team"
        SET "onboardingFirstFixtureEmailSentAt" = COALESCE("onboardingFirstFixtureEmailSentAt", NOW())
        WHERE "id" = ${input.teamId}
      `;
      return;
    case "postFirstMatch":
      await prisma.$executeRaw`
        UPDATE "Team"
        SET "onboardingPostFirstMatchEmailSentAt" = COALESCE("onboardingPostFirstMatchEmailSentAt", NOW())
        WHERE "id" = ${input.teamId}
      `;
      return;
  }
}

async function getCandidateTeams() {
  return prisma.$queryRaw<CaptainOnboardingEmailRow[]>`
    SELECT
      t."id",
      t."name",
      t."contactName",
      t."contactEmail",
      t."secondaryContactEmail",
      (
        SELECT u."name"
        FROM "TeamMember" tm
        INNER JOIN "User" u ON u."id" = tm."userId"
        WHERE tm."teamId" = t."id"
          AND tm."role" = 'CAPTAIN'
        ORDER BY tm."createdAt" ASC
        LIMIT 1
      ) AS "captainName",
      (
        SELECT u."email"
        FROM "TeamMember" tm
        INNER JOIN "User" u ON u."id" = tm."userId"
        WHERE tm."teamId" = t."id"
          AND tm."role" = 'CAPTAIN'
        ORDER BY tm."createdAt" ASC
        LIMIT 1
      ) AS "captainEmail",
      t."captainAgreementAcceptedAt",
      t."onboardingWelcomeEmailSentAt",
      t."onboardingFirstFixtureEmailSentAt",
      t."onboardingPostFirstMatchEmailSentAt",
      (
        SELECT MIN(f."kickoffAt")
        FROM "Fixture" f
        WHERE (f."homeTeamId" = t."id" OR f."awayTeamId" = t."id")
          AND f."status" = 'SCHEDULED'
          AND f."kickoffAt" > NOW()
      ) AS "nextFixtureAt",
      EXISTS (
        SELECT 1
        FROM "Fixture" f
        INNER JOIN "MatchResult" r ON r."fixtureId" = f."id"
        WHERE f."homeTeamId" = t."id" OR f."awayTeamId" = t."id"
      ) AS "hasCompletedMatch"
    FROM "Team" t
    WHERE t."captainUserId" IS NOT NULL
       OR t."contactEmail" IS NOT NULL
       OR EXISTS (
        SELECT 1
        FROM "TeamMember" tm
        WHERE tm."teamId" = t."id"
          AND tm."role" = 'CAPTAIN'
      )
    ORDER BY t."name" ASC
  `;
}

async function queueStage(input: {
  row: CaptainOnboardingEmailRow;
  stage: OnboardingEmailStage;
}) {
  const captainEmail = getCaptainEmail(input.row);

  if (!captainEmail) {
    return "missing_email" as const;
  }

  const siteUrl = getSiteUrl();
  const captainDashboardUrl = `${siteUrl}/captain/team/${input.row.id}`;
  const captainGuideUrl = `${siteUrl}/captain/team/${input.row.id}/guide`;
  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.TEAM,
    sourceId: input.row.id,
    audience: NotificationAudience.TEAM,
    displayName: getCaptainName(input.row),
    email: captainEmail,
    transactionalEmailOptIn: true,
    metadata: {
      teamId: input.row.id,
      source: "captain_onboarding",
    },
  });

  await queueNotificationFromTemplate({
    templateKey: TEMPLATE_KEYS[input.stage],
    recipientId: recipient.id,
    sourceType: "TEAM",
    sourceId: input.row.id,
    variables: {
      captainName: getCaptainName(input.row),
      teamName: input.row.name,
      captainDashboardUrl,
      captainGuideUrl,
    },
    metadata: {
      type: "captain_onboarding",
      stage: input.stage,
      teamId: input.row.id,
    } satisfies Prisma.InputJsonValue,
  });

  await markStageQueued({ teamId: input.row.id, stage: input.stage });

  return "queued" as const;
}

export async function runCaptainOnboardingEmailJob(): Promise<CaptainOnboardingEmailJobSummary> {
  const summary: CaptainOnboardingEmailJobSummary = {
    scannedTeams: 0,
    queuedDispatches: 0,
    skippedNoEmail: 0,
    alreadySentOrNotDue: 0,
    schemaReady: true,
    errors: [],
  };

  let rows: CaptainOnboardingEmailRow[];

  try {
    rows = await getCandidateTeams();
  } catch (error) {
    summary.schemaReady = false;
    summary.errors.push(
      error instanceof Error ? error.message : "Captain onboarding email schema is not ready.",
    );
    return summary;
  }

  summary.scannedTeams = rows.length;
  const now = new Date();

  for (const row of rows) {
    for (const stage of Object.keys(TEMPLATE_KEYS) as OnboardingEmailStage[]) {
      if (!shouldQueueStage({ row, stage, now })) {
        summary.alreadySentOrNotDue += 1;
        continue;
      }

      try {
        const result = await queueStage({ row, stage });

        if (result === "queued") {
          summary.queuedDispatches += 1;
        } else {
          summary.skippedNoEmail += 1;
        }
      } catch (error) {
        if (summary.errors.length < 10) {
          summary.errors.push(
            `${row.id}:${stage}:${error instanceof Error ? error.message : "Unknown onboarding email error"}`,
          );
        }
      }
    }
  }

  return summary;
}
