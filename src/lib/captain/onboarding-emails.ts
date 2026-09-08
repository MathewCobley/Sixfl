// ========================================
// File: src/lib/captain/onboarding-emails.ts
// ========================================

import {
  NotificationAudience,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { queueFirstMatchReadyEmail } from "./first-match-ready";

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

const STAGE_TEMPLATE_KEYS: Record<CaptainOnboardingEmailStage, string> = {
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

  switch (input.stage) {
    case "welcome":
      return !input.row.onboardingWelcomeEmailSentAt;
    case "firstFixture":
      // Shared service checks first-match history, publication and same-day catch-up.
      return true;
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
    WHERE t."secondaryContactEmail" IS NOT NULL
       OR t."captainUserId" IS NOT NULL
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
  if (input.stage === "firstFixture") {
    return queueFirstMatchReadyEmail({ teamId: input.row.id, manual: input.manual });
  }

  if (!input.manual) {
  const previousAttempt = await prisma.notificationDispatch.findFirst({
    where: { sourceType: "TEAM", sourceId: input.row.id, channel: "EMAIL", OR: [
      { template: { is: { key: STAGE_TEMPLATE_KEYS[input.stage] } } },
      { AND: [
        { metadata: { path: ["type"], equals: "captain_onboarding" } },
        { metadata: { path: ["stage"], equals: input.stage } },
      ] },
    ] }, select: { id: true },
  });
  if (previousAttempt) return "not_due" as const;
}

  const captainEmail = getCaptainEmail(input.row);

  if (!captainEmail) {
    return "missing_email" as const;
  }

  const siteUrl = getSiteUrl();
  const captainDashboardUrl = `${siteUrl}/captain/team/${input.row.id}`;
  const email = captainEmail.trim().toLowerCase();
  const contact = { displayName: getCaptainName(input.row), email, emailNormalized: email, lastSyncedAt: new Date() };
  const recipient = await prisma.notificationRecipient.upsert({
    where: { sourceType_sourceId: { sourceType: NotificationRecipientSourceType.TEAM, sourceId: input.row.id } },
    update: contact,
    create: { ...contact, sourceType: NotificationRecipientSourceType.TEAM, sourceId: input.row.id,
      audience: NotificationAudience.TEAM, transactionalEmailOptIn: true,
      metadata: { teamId: input.row.id, source: "captain_onboarding" } },
  });
  await prisma.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
  const captainName = getCaptainName(input.row);

  const dispatch = await queueNotificationFromTemplate({
    templateKey: STAGE_TEMPLATE_KEYS[input.stage],
    recipientId: recipient.id,
    sourceType: "TEAM",
    sourceId: input.row.id,
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

  if (dispatch.status !== "QUEUED") return "not_due" as const;
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
    for (const stage of Object.keys(STAGE_TEMPLATE_KEYS) as CaptainOnboardingEmailStage[]) {
      if (!shouldQueueStage({ row, stage, now })) {
        summary.alreadySentOrNotDue += 1;
        continue;
      }

      try {
        const result = await queueStage({ row, stage });

        if (result === "queued") {
          summary.queuedDispatches += 1;
        } else if (result === "missing_email") {
          summary.skippedNoEmail += 1;
        } else {
          summary.alreadySentOrNotDue += 1;
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
