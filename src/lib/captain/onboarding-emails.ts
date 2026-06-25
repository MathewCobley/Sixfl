// ========================================
// File: src/lib/captain/onboarding-emails.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";

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

export type CaptainOnboardingEmailStage = "welcome" | "firstFixture" | "postFirstMatch";

export const CAPTAIN_ONBOARDING_EMAIL_STAGE_LABELS: Record<CaptainOnboardingEmailStage, string> = {
  welcome: "Welcome",
  firstFixture: "First fixture",
  postFirstMatch: "Post-match",
};

const STAGE_CONTENT: Record<
  CaptainOnboardingEmailStage,
  {
    subject: string;
    body: (input: { captainName: string }) => string;
    ctaLabel: string;
  }
> = {
  welcome: {
    subject: "Welcome to SIXFL - complete your team setup",
    ctaLabel: "Open captain area",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "Welcome to SIXFL. Your team is now set up.",
      "",
      "Please log in to your captain area and complete the team setup checklist before your first fixture. It only takes a few minutes and covers your squad, availability, payments and matchday responsibilities.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  firstFixture: {
    subject: "Your first SIXFL fixture is coming up",
    ctaLabel: "Open captain area",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "Your first SIXFL fixture is coming up. Please confirm availability, check your squad details and make sure payment arrangements are sorted before matchday.",
      "",
      "You can use the captain checklist and guide in your dashboard if you need a reminder.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  postFirstMatch: {
    subject: "Thanks for your first SIXFL game",
    ctaLabel: "Open captain area",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "Hope you enjoyed your first SIXFL game.",
      "",
      "Your captain area is where you can find fixtures, squad details, payments, results and support. The Captain Guide is also there if you need a quick reminder of weekly responsibilities.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
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

function isCaptainOnboardingEmailStage(value: string): value is CaptainOnboardingEmailStage {
  return value === "welcome" || value === "firstFixture" || value === "postFirstMatch";
}

export function parseCaptainOnboardingEmailStage(value: FormDataEntryValue | string | null) {
  const parsed = String(value ?? "").trim();

  return isCaptainOnboardingEmailStage(parsed) ? parsed : null;
}

function shouldQueueStage(input: {
  row: CaptainOnboardingEmailRow;
  stage: CaptainOnboardingEmailStage;
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
  stage: CaptainOnboardingEmailStage;
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

function selectCaptainOnboardingEmailRow() {
  return Prisma.sql`
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
  `;
}

async function getCandidateTeams() {
  return prisma.$queryRaw<CaptainOnboardingEmailRow[]>`
    SELECT ${selectCaptainOnboardingEmailRow()}
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

async function getCandidateTeam(teamId: string) {
  const rows = await prisma.$queryRaw<CaptainOnboardingEmailRow[]>`
    SELECT ${selectCaptainOnboardingEmailRow()}
    FROM "Team" t
    WHERE t."id" = ${teamId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function queueStage(input: {
  row: CaptainOnboardingEmailRow;
  stage: CaptainOnboardingEmailStage;
  manual?: boolean;
}) {
  const captainEmail = getCaptainEmail(input.row);

  if (!captainEmail) {
    return "missing_email" as const;
  }

  const siteUrl = getSiteUrl();
  const captainDashboardUrl = `${siteUrl}/captain/team/${input.row.id}`;
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
  const content = STAGE_CONTENT[input.stage];
  const captainName = getCaptainName(input.row);

  await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: content.subject,
    body: content.body({ captainName }),
    sourceType: "TEAM",
    sourceId: input.row.id,
    emailCta: {
      label: content.ctaLabel,
      url: captainDashboardUrl,
    },
    variables: {
      captainName,
      teamName: input.row.name,
      captainDashboardUrl,
    },
    metadata: {
      type: "captain_onboarding",
      stage: input.stage,
      teamId: input.row.id,
      manual: input.manual === true,
    } satisfies Prisma.InputJsonValue,
  });

  await markStageQueued({ teamId: input.row.id, stage: input.stage });

  return "queued" as const;
}

export async function queueCaptainOnboardingEmailForTeam(input: {
  teamId: string;
  stage: CaptainOnboardingEmailStage;
  force?: boolean;
  manual?: boolean;
}) {
  const row = await getCandidateTeam(input.teamId);

  if (!row) {
    return "missing_team" as const;
  }

  if (!input.force && !shouldQueueStage({ row, stage: input.stage, now: new Date() })) {
    return "not_due" as const;
  }

  return queueStage({ row, stage: input.stage, manual: input.manual });
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
    for (const stage of Object.keys(STAGE_CONTENT) as CaptainOnboardingEmailStage[]) {
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
