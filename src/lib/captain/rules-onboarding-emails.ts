import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertAdditionalCaptainOperationalRecipients } from "@/lib/notifications/team-operational-recipients";

const DAY_MS = 24 * 60 * 60 * 1000;
const RULE_ONBOARDING_SOURCE_TYPE = "CAPTAIN_RULE_ONBOARDING";
const RULE_ONBOARDING_ROLLOUT_AT = new Date("2026-09-01T00:00:00.000Z");
const MIN_GAP_BETWEEN_RULE_EMAILS_MS = 6 * DAY_MS;

type RulesOnboardingTeamRow = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  secondaryContactEmail: string | null;
  captainName: string | null;
  captainEmail: string | null;
  firstFixtureAt: Date | null;
};

type RuleStage = {
  key: string;
  week: number;
  label: string;
  subject: string;
  body: (input: { captainName: string; teamName: string }) => string;
};

export type CaptainRulesOnboardingSummary = {
  scannedTeams: number;
  eligibleTeams: number;
  queuedDispatches: number;
  skippedNotDue: number;
  skippedNoEmail: number;
  errors: string[];
};

const RULE_STAGES: RuleStage[] = [
  {
    key: "players-and-eligibility",
    week: 1,
    label: "Players and eligibility",
    subject: "SIXFL Captain Guide #1 - player eligibility",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "A quick SIXFL rule for this week: player registration and eligibility.",
      "",
      "A player can only be permanently registered to one team in the same SIXFL league/season. They can play for teams in different SIXFL leagues, but if they are already registered to another team in your league they must not simply be added to your squad.",
      "",
      "If you need to use someone from another team in the same league, contact SIXFL first. We can approve them as a guest player for that fixture where appropriate.",
      "",
      "Going forwards, a team that fields an ineligible player may have the result overturned and recorded as a 3-0 forfeit loss.",
      "",
      "If you are unsure, ask us before the match and we will confirm whether the player is eligible.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  {
    key: "fixtures-and-confirmations",
    week: 2,
    label: "Fixtures and confirmations",
    subject: "SIXFL Captain Guide #2 - fixtures and confirmations",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "This week's captain guide is about fixtures and confirmations.",
      "",
      "Please check your SIXFL dashboard regularly and confirm fixtures promptly. The dashboard is the live record of your team's fixture, including the date, kick-off time and venue.",
      "",
      "If SIXFL changes an important fixture detail we will contact the team, but captains remain responsible for making sure their players know when and where they are playing.",
      "",
      "If anything shown in your dashboard looks wrong, contact us as soon as possible rather than waiting until matchday.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  {
    key: "fees-and-payments",
    week: 3,
    label: "Match fees and payments",
    subject: "SIXFL Captain Guide #3 - match fees and payments",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "This week's captain guide covers match fees and payments.",
      "",
      "Your captain dashboard shows the amount due for each fixture and the payment options available to your team. Please make sure payment arrangements are in place before the match and do not ignore an outstanding balance because someone else normally deals with it.",
      "",
      "If you use Squad payments, keep your current squad details accurate so payment requests only go to the players who are actually part of the team.",
      "",
      "If there is a payment problem, contact SIXFL early so we can help before it becomes an issue on matchday.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  {
    key: "matchday-and-punctuality",
    week: 4,
    label: "Matchday and punctuality",
    subject: "SIXFL Captain Guide #4 - matchday basics",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "This week's captain guide is about keeping match nights running on time.",
      "",
      "Please have enough players ready before your scheduled kick-off. SIXFL nights run to a tight timetable, so one late game can affect every team playing afterwards.",
      "",
      "Captains should also make sure their team is ready to follow the referee's instructions and that any kit or colour issue is dealt with quickly.",
      "",
      "If you know you are going to have a problem getting a team there, tell SIXFL as early as you can.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  {
    key: "cancellations-and-postponements",
    week: 5,
    label: "Cancellations and postponements",
    subject: "SIXFL Captain Guide #5 - cancellations and postponements",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "This week's captain guide covers cancellations, postponements and teams being unable to play.",
      "",
      "Please do not assume a fixture is cancelled because another captain has messaged you. A fixture only changes when SIXFL confirms the change and the live fixture information is updated.",
      "",
      "If your team may be unable to fulfil a fixture, contact SIXFL immediately. The more notice we have, the better chance we have of finding a solution and avoiding disruption to the other team and referee.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  {
    key: "behaviour-and-discipline",
    week: 6,
    label: "Behaviour and discipline",
    subject: "SIXFL Captain Guide #6 - behaviour and discipline",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "This week's captain guide is about behaviour and discipline.",
      "",
      "Captains are responsible for helping keep their team under control. Respect for opponents, referees and venue staff is expected at every SIXFL fixture.",
      "",
      "Disciplinary sanctions, suspensions and player-eligibility restrictions must be followed. If you are unsure whether a player is suspended or eligible, contact SIXFL before selecting them.",
      "",
      "We would always rather answer the question beforehand than deal with a disciplinary or eligibility problem afterwards.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
  {
    key: "results-disputes-and-rules",
    week: 7,
    label: "Results, disputes and the rules",
    subject: "SIXFL Captain Guide #7 - results, disputes and the rules",
    body: ({ captainName }) => [
      `Hi ${captainName},`,
      "",
      "The final email in our short captain guide covers results and disputes.",
      "",
      "If a score, player issue or fixture detail is wrong, tell SIXFL promptly and give us the facts while they are still fresh. Do not try to settle eligibility, disciplinary or competition-rule disputes directly with another team.",
      "",
      "The full SIXFL League Rules are always available online. They remain the definitive rules if a short captain-guide email cannot cover every situation.",
      "",
      "You will not keep receiving weekly rules emails after this one. We will only contact you about rule changes when there is something genuinely relevant to your team or league.",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
  },
];

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

function getPrimaryCaptainName(row: RulesOnboardingTeamRow) {
  return row.captainName?.trim() || row.contactName?.trim() || "Captain";
}

function getPrimaryCaptainEmail(row: RulesOnboardingTeamRow) {
  return (
    row.captainEmail?.trim().toLowerCase() ||
    row.contactEmail?.trim().toLowerCase() ||
    row.secondaryContactEmail?.trim().toLowerCase() ||
    null
  );
}

async function getCandidateTeams() {
  return prisma.$queryRaw<RulesOnboardingTeamRow[]>`
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
      (
        SELECT MIN(f."kickoffAt")
        FROM "Fixture" f
        WHERE (f."homeTeamId" = t."id" OR f."awayTeamId" = t."id")
          AND f."publishedAt" IS NOT NULL
          AND f."status" <> 'CANCELLED'
      ) AS "firstFixtureAt"
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

function getStageSourceId(teamId: string, stage: RuleStage) {
  return `${teamId}:${stage.key}`;
}

async function getFirstUnsentDueStage(row: RulesOnboardingTeamRow, now: Date) {
  if (!row.firstFixtureAt || row.firstFixtureAt < RULE_ONBOARDING_ROLLOUT_AT) {
    return null;
  }

  const latestDispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: RULE_ONBOARDING_SOURCE_TYPE,
      sourceId: { startsWith: `${row.id}:` },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (
    latestDispatch &&
    now.getTime() - latestDispatch.createdAt.getTime() < MIN_GAP_BETWEEN_RULE_EMAILS_MS
  ) {
    return null;
  }

  for (const stage of RULE_STAGES) {
    const dueAt = new Date(row.firstFixtureAt.getTime() + stage.week * 7 * DAY_MS);
    if (dueAt > now) break;

    const alreadyQueued = await prisma.notificationDispatch.findFirst({
      where: {
        sourceType: RULE_ONBOARDING_SOURCE_TYPE,
        sourceId: getStageSourceId(row.id, stage),
      },
      select: { id: true },
    });

    if (!alreadyQueued) return stage;
  }

  return null;
}

async function getRecipients(row: RulesOnboardingTeamRow) {
  const recipients = [];
  const primaryEmail = getPrimaryCaptainEmail(row);

  if (primaryEmail) {
    recipients.push(
      await upsertNotificationRecipient({
        sourceType: NotificationRecipientSourceType.TEAM,
        sourceId: row.id,
        audience: NotificationAudience.TEAM,
        displayName: getPrimaryCaptainName(row),
        email: primaryEmail,
        transactionalEmailOptIn: true,
        metadata: {
          teamId: row.id,
          source: "captain_rules_onboarding",
        },
      }),
    );
  }

  const additional = await upsertAdditionalCaptainOperationalRecipients({
    teamId: row.id,
    excludeEmail: primaryEmail,
  });

  const seenRecipientIds = new Set(recipients.map((recipient) => recipient.id));
  for (const recipient of additional) {
    if (!seenRecipientIds.has(recipient.id)) {
      seenRecipientIds.add(recipient.id);
      recipients.push(recipient);
    }
  }

  return recipients;
}

async function queueStageForTeam(row: RulesOnboardingTeamRow, stage: RuleStage) {
  const recipients = await getRecipients(row);
  if (recipients.length === 0) return { queued: 0, missingEmail: 1 };

  const siteUrl = getSiteUrl();
  const rulesUrl = `${siteUrl}/league-rules`;
  let queued = 0;

  for (const recipient of recipients) {
    if (!recipient.email?.trim()) continue;

    const sourceId = getStageSourceId(row.id, stage);
    const alreadyQueuedForRecipient = await prisma.notificationDispatch.findFirst({
      where: {
        recipientId: recipient.id,
        sourceType: RULE_ONBOARDING_SOURCE_TYPE,
        sourceId,
      },
      select: { id: true },
    });

    if (alreadyQueuedForRecipient) continue;

    const captainName = recipient.displayName?.trim() || getPrimaryCaptainName(row);

    await queueDirectNotification({
      recipientId: recipient.id,
      channel: NotificationChannel.EMAIL,
      audience: NotificationAudience.TEAM,
      isTransactional: true,
      subject: stage.subject,
      body: stage.body({ captainName, teamName: row.name }),
      sourceType: RULE_ONBOARDING_SOURCE_TYPE,
      sourceId,
      emailCta: {
        label: "View SIXFL League Rules",
        url: rulesUrl,
      },
      variables: {
        captainName,
        teamName: row.name,
        rulesUrl,
      },
      metadata: {
        type: "captain_rules_onboarding",
        stage: stage.key,
        stageLabel: stage.label,
        week: stage.week,
        teamId: row.id,
      } satisfies Prisma.InputJsonValue,
    });

    queued += 1;
  }

  return { queued, missingEmail: queued === 0 ? 1 : 0 };
}

export async function runCaptainRulesOnboardingEmailJob(): Promise<CaptainRulesOnboardingSummary> {
  const summary: CaptainRulesOnboardingSummary = {
    scannedTeams: 0,
    eligibleTeams: 0,
    queuedDispatches: 0,
    skippedNotDue: 0,
    skippedNoEmail: 0,
    errors: [],
  };

  const rows = await getCandidateTeams();
  summary.scannedTeams = rows.length;
  const now = new Date();

  for (const row of rows) {
    if (!row.firstFixtureAt || row.firstFixtureAt < RULE_ONBOARDING_ROLLOUT_AT) {
      summary.skippedNotDue += 1;
      continue;
    }

    summary.eligibleTeams += 1;

    try {
      const stage = await getFirstUnsentDueStage(row, now);
      if (!stage) {
        summary.skippedNotDue += 1;
        continue;
      }

      const result = await queueStageForTeam(row, stage);
      summary.queuedDispatches += result.queued;
      summary.skippedNoEmail += result.missingEmail;
    } catch (error) {
      if (summary.errors.length < 10) {
        summary.errors.push(
          `${row.id}:${error instanceof Error ? error.message : "Unknown captain rules onboarding error"}`,
        );
      }
    }
  }

  return summary;
}
