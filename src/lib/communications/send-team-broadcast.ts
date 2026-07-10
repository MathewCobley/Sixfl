// ========================================
// File: src/lib/communications/send-team-broadcast.ts
// ========================================

import { randomUUID } from "crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  Prisma,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { prisma } from "@/lib/prisma";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { queueDirectNotification } from "@/lib/notifications/service";
import { getPublicSiteUrl } from "@/lib/stripe/client";

type BroadcastVariables = Record<string, string | number | boolean | null>;

type Input = {
  teamId: string;
  channel: NotificationChannel;
  subject?: string | null;
  body: string;
  templateId?: string | null;
  templateKey?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  pollId?: string | null;
  origin: string;
  originLabel: string;
  metadata?: Record<string, unknown>;
  variables?: BroadcastVariables;
  createdByUserId?: string | null;
};

type TeamForPoll = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

type PollOptionRow = {
  id: string;
  label: string;
  sortOrder: number;
};

type PollRow = {
  id: string;
  title: string;
  question: string;
  status: string;
  options: PollOptionRow[];
};

const POLL_OPTIONS_PLACEHOLDER = "{{pollOptions}}";
const POLL_LINK_PLACEHOLDER = "{{pollLink}}";
const POLL_OPTIONS_BLOCK_START = "SIXFL_POLL_OPTIONS_START";
const POLL_OPTIONS_BLOCK_END = "SIXFL_POLL_OPTIONS_END";

function getFirstName(name?: string | null) {
  const firstName = name?.trim().split(/\s+/)[0]?.trim();
  return firstName || "there";
}

function messageNeedsPoll(body: string) {
  return body.includes(POLL_OPTIONS_PLACEHOLDER) || body.includes(POLL_LINK_PLACEHOLDER);
}

function buildPollUrl(token: string) {
  return `${getPublicSiteUrl()}/polls/${encodeURIComponent(token)}`;
}

function buildPollVoteUrl(token: string, optionId: string) {
  return `${getPublicSiteUrl()}/polls/${encodeURIComponent(token)}/vote/${encodeURIComponent(optionId)}`;
}

async function getPollOptions(pollId: string) {
  return prisma.$queryRaw<PollOptionRow[]>(Prisma.sql`
    SELECT "id", "label", "sortOrder"
    FROM "SIXFLPollOption"
    WHERE "pollId" = ${pollId}
    ORDER BY "sortOrder" ASC, "label" ASC
  `);
}

async function getPollForBroadcast(
  pollId: string | null | undefined,
  allowLatestFallback = false,
): Promise<PollRow | null> {
  const id = pollId?.trim();

  const rows = id
    ? await prisma.$queryRaw<Array<{ id: string; title: string; question: string; status: string }>>(Prisma.sql`
        SELECT "id", "title", "question", "status"
        FROM "SIXFLPoll"
        WHERE "id" = ${id}
        LIMIT 1
      `)
    : allowLatestFallback
      ? await prisma.$queryRaw<Array<{ id: string; title: string; question: string; status: string }>>(Prisma.sql`
          SELECT "id", "title", "question", "status"
          FROM "SIXFLPoll"
          WHERE "status" IN ('ACTIVE', 'DRAFT')
          ORDER BY "updatedAt" DESC, "createdAt" DESC
          LIMIT 1
        `)
      : [];

  const poll = rows[0] ?? null;
  if (!poll) return null;

  const options = await getPollOptions(poll.id);

  return {
    ...poll,
    options,
  };
}

async function ensurePollRecipient(input: { poll: PollRow; team: TeamForPoll }) {
  const [existing] = await prisma.$queryRaw<Array<{ token: string }>>(Prisma.sql`
    SELECT "token"
    FROM "SIXFLPollRecipient"
    WHERE "pollId" = ${input.poll.id}
      AND "sourceType" = 'TEAM'
      AND "sourceId" = ${input.team.id}
    LIMIT 1
  `);

  if (existing?.token) return existing.token;

  const token = randomUUID().replaceAll("-", "");
  const now = new Date();

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "SIXFLPollRecipient" (
      "id",
      "pollId",
      "teamName",
      "contactName",
      "contactEmail",
      "contactPhone",
      "sourceType",
      "sourceId",
      "token",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${input.poll.id},
      ${input.team.name},
      ${input.team.contactName},
      ${input.team.contactEmail},
      ${input.team.contactPhone},
      'TEAM',
      ${input.team.id},
      ${token},
      ${now},
      ${now}
    )
  `);

  return token;
}

function buildPollOptionsBlock(input: { poll: PollRow; token: string }) {
  const optionLines = input.poll.options.map(
    (option) => `${option.label}: ${buildPollVoteUrl(input.token, option.id)}`,
  );

  return [
    input.poll.question,
    "",
    POLL_OPTIONS_BLOCK_START,
    ...optionLines,
    POLL_OPTIONS_BLOCK_END,
    "",
    `Open the poll / change your answer: ${buildPollUrl(input.token)}`,
  ].join("\n");
}

async function resolvePollContent(input: {
  body: string;
  pollId?: string | null;
  team: TeamForPoll;
}) {
  const needsPoll = messageNeedsPoll(input.body);
  const poll = await getPollForBroadcast(input.pollId, needsPoll);

  if (needsPoll && !poll) {
    throw new Error("This message contains {{pollOptions}} or {{pollLink}}, but no poll was selected and no open poll could be found.");
  }

  if (!poll) {
    return {
      body: input.body,
      variables: {},
      metadata: {},
    };
  }

  if (poll.status === "CLOSED") {
    throw new Error("The selected poll is closed. Re-open it before sending poll links.");
  }

  if (poll.options.length < 2) {
    throw new Error("The selected poll needs at least two options before it can be sent.");
  }

  const token = await ensurePollRecipient({ poll, team: input.team });
  const pollOptions = buildPollOptionsBlock({ poll, token });
  const pollLink = buildPollUrl(token);

  return {
    body: input.body
      .replaceAll(POLL_OPTIONS_PLACEHOLDER, pollOptions)
      .replaceAll(POLL_LINK_PLACEHOLDER, pollLink)
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    variables: {
      pollOptions,
      pollLink,
    },
    metadata: {
      pollId: poll.id,
      pollTitle: poll.title,
      pollToken: token,
    },
  };
}

export async function sendTeamBroadcastMessage(input: Input) {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      leagueId: true,
      name: true,
      logoUrl: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) {
    throw new Error("Team not found");
  }

  const pollContent = await resolvePollContent({
    body: input.body,
    pollId: input.pollId,
    team: {
      id: team.id,
      name: team.name,
      contactName: team.contactName,
      contactEmail: team.contactEmail,
      contactPhone: team.contactPhone,
    },
  });

  const { recipient, snapshot } = await upsertTeamNotificationRecipient(team.id);
  const contactName = snapshot.primaryContact.name?.trim() || snapshot.teamName;
  const leagueName = team.league
    ? `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`
    : "";

  const variables = {
    firstName: getFirstName(contactName),
    name: contactName,
    fullName: contactName,
    teamName: team.name,
    leagueName,
    signupUrl: "https://www.sixfl.co.uk/register-interest",
    link: input.ctaUrl ?? "",
    ...pollContent.variables,
    ...(input.variables ?? {}),
  };

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: input.channel,
    audience: NotificationAudience.TEAM,
    subject: input.channel === NotificationChannel.EMAIL ? input.subject ?? null : null,
    body: pollContent.body,
    isTransactional: true,
    sourceType: "TEAM",
    sourceId: team.id,
    variables,
    emailBranding:
      input.channel === NotificationChannel.EMAIL
        ? {
            teamName: snapshot.teamName,
            teamLogoUrl: team.logoUrl ?? null,
            leagueName: leagueName || null,
          }
        : undefined,
    emailCta:
      input.channel === NotificationChannel.EMAIL && input.ctaLabel && input.ctaUrl
        ? {
            label: input.ctaLabel,
            url: input.ctaUrl,
          }
        : undefined,
    metadata: {
      origin: input.origin,
      originLabel: input.originLabel,
      teamId: team.id,
      teamName: team.name,
      leagueId: team.leagueId,
      templateId: input.templateId ?? null,
      templateKey: input.templateKey ?? null,
      ctaLabel: input.ctaLabel ?? null,
      ctaUrl: input.ctaUrl ?? null,
      ...pollContent.metadata,
      ...(input.metadata ?? {}),
    },
    createdByUserId: input.createdByUserId ?? null,
  });

  await logNotificationDispatchToThread({
    dispatch,
    recipient,
  });

  return {
    skipped: dispatch.status === NotificationDispatchStatus.SKIPPED,
    reason: dispatch.status === NotificationDispatchStatus.SKIPPED ? dispatch.failureReason : null,
    dispatchId: dispatch.id,
    teamId: team.id,
    status: dispatch.status,
  };
}
