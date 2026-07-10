// ========================================
// File: src/app/(admin)/admin/communications/all-team-actions.ts
// ========================================

"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { NotificationChannel, Prisma } from "@prisma/client";

import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { extractNotificationTokens } from "@/lib/notifications/renderer";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getPublicSiteUrl } from "@/lib/stripe/client";

const POLL_OPTIONS_PLACEHOLDER = "{{pollOptions}}";
const POLL_LINK_PLACEHOLDER = "{{pollLink}}";
const POLL_OPTIONS_BLOCK_START = "SIXFL_POLL_OPTIONS_START";
const POLL_OPTIONS_BLOCK_END = "SIXFL_POLL_OPTIONS_END";

const SUPPORTED_TEAM_MESSAGE_TOKENS = new Set([
  "firstName",
  "name",
  "fullName",
  "teamName",
  "leagueName",
  "signupUrl",
  "link",
  "pollOptions",
  "pollLink",
]);

const ALL_LEAGUES_VALUE = "all";
const NO_LEAGUE_LABEL = "No league assigned";

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

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function safeRedirect(value: FormDataEntryValue | null, fallback: string) {
  const target = text(value) || fallback;
  return target.startsWith("/") ? target : fallback;
}

function appendRedirectParams(
  path: string,
  params: Record<string, string | number | null | undefined>,
) {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number] => {
      const value = entry[1];
      return value !== null && value !== undefined && String(value).trim() !== "";
    },
  );

  if (entries.length === 0) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")}`;
}

function getUnsupportedTemplateTokens(...values: string[]) {
  const tokens = new Set(values.flatMap((value) => extractNotificationTokens(value)));
  return Array.from(tokens).filter((token) => !SUPPORTED_TEAM_MESSAGE_TOKENS.has(token));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Unknown error";
}

function getTeamLeagueLabel(team: {
  league: { name: string; season: string | null } | null;
}) {
  if (!team.league) return NO_LEAGUE_LABEL;
  return `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}`;
}

function getChannelLabel(channel: NotificationChannel) {
  return channel === NotificationChannel.SMS ? "SMS" : "email";
}

function getChannelQueuedNoun(channel: NotificationChannel) {
  return channel === NotificationChannel.SMS ? "SMS messages" : "emails";
}

function getMissingContactLabel(channel: NotificationChannel) {
  return channel === NotificationChannel.SMS ? "mobile numbers" : "email addresses";
}

async function processQueuedTeamMessages(queuedCount: number) {
  if (queuedCount <= 0) return;

  try {
    await processNotificationQueue(Math.max(queuedCount + 10, 25));
  } catch (error) {
    console.error("Failed to process selected team messages immediately", error);
  }
}

async function getPollForMessage(pollId: string | null): Promise<PollRow | null> {
  if (!pollId) return null;

  const [poll] = await prisma.$queryRaw<
    Array<{ id: string; title: string; question: string; status: string }>
  >(Prisma.sql`
    SELECT "id", "title", "question", "status"
    FROM "SIXFLPoll"
    WHERE "id" = ${pollId}
    LIMIT 1
  `);

  if (!poll) return null;

  const options = await prisma.$queryRaw<PollOptionRow[]>(Prisma.sql`
    SELECT "id", "label", "sortOrder"
    FROM "SIXFLPollOption"
    WHERE "pollId" = ${poll.id}
    ORDER BY "sortOrder" ASC, "label" ASC
  `);

  return {
    ...poll,
    options,
  };
}

function buildPollUrl(token: string) {
  return `${getPublicSiteUrl()}/polls/${encodeURIComponent(token)}`;
}

function buildPollVoteUrl(token: string, optionId: string) {
  return `${getPublicSiteUrl()}/polls/${encodeURIComponent(token)}/vote/${encodeURIComponent(optionId)}`;
}

async function ensurePollRecipient(input: {
  poll: PollRow;
  team: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
}) {
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
    `Open the poll / add a note: ${buildPollUrl(input.token)}`,
  ].join("\n");
}

function applyPollToMessage(input: { body: string; poll: PollRow | null; token: string | null }) {
  if (!input.poll || !input.token) {
    return input.body
      .replaceAll(POLL_OPTIONS_PLACEHOLDER, "")
      .replaceAll(POLL_LINK_PLACEHOLDER, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return input.body
    .replaceAll(POLL_OPTIONS_PLACEHOLDER, buildPollOptionsBlock({ poll: input.poll, token: input.token }))
    .replaceAll(POLL_LINK_PLACEHOLDER, buildPollUrl(input.token))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendAllTeamsCommunicationMessageAction(formData: FormData) {
  const { user } = await requireAdmin();

  const from = safeRedirect(formData.get("from"), "/admin/messaging/teams");
  const channelInput = text(formData.get("channel")).toUpperCase();
  const channel = channelInput === "SMS" ? NotificationChannel.SMS : NotificationChannel.EMAIL;
  const channelLabel = getChannelLabel(channel);
  const queuedNoun = getChannelQueuedNoun(channel);
  const subject = text(formData.get("subject"));
  const body = text(formData.get("body"));
  const templateId = text(formData.get("templateId")) || null;
  const templateKey = text(formData.get("templateKey")) || null;
  const ctaLabel = text(formData.get("ctaLabel")) || null;
  const ctaUrl = text(formData.get("ctaUrl")) || null;
  const selectedPollId = text(formData.get("pollId")) || null;
  const selectedLeagueFilter = text(formData.get("selectedLeagueFilter")) || ALL_LEAGUES_VALUE;
  const selectedTeamIds = Array.from(
    new Set(
      formData
        .getAll("teamIds")
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  );

  if (!body) {
    redirect(appendRedirectParams(from, { error: "Message body is required." }));
  }

  if (channel === NotificationChannel.EMAIL && !subject) {
    redirect(appendRedirectParams(from, { error: "Email subject is required." }));
  }

  if (selectedTeamIds.length === 0) {
    redirect(appendRedirectParams(from, { error: `Select at least one team before queueing the ${channelLabel}.` }));
  }

  const unsupportedTokens = getUnsupportedTemplateTokens(
    channel === NotificationChannel.EMAIL ? subject : "",
    body,
  );

  if (unsupportedTokens.length > 0) {
    const listedTokens = unsupportedTokens.map((token) => `{{${token}}}`).join(", ");

    redirect(
      appendRedirectParams(from, {
        error: `This selected-teams message contains unsupported placeholder${unsupportedTokens.length === 1 ? "" : "s"}: ${listedTokens}. Supported placeholders are {{firstName}}, {{name}}, {{fullName}}, {{teamName}}, {{leagueName}}, {{signupUrl}}, {{link}}, {{pollOptions}} and {{pollLink}}.`,
      }),
    );
  }

  const poll = await getPollForMessage(selectedPollId);
  const needsPoll = body.includes(POLL_OPTIONS_PLACEHOLDER) || body.includes(POLL_LINK_PLACEHOLDER);

  if (needsPoll && !poll) {
    redirect(appendRedirectParams(from, { error: "Choose a poll before inserting poll options into the message." }));
  }

  if (poll && poll.options.length < 2) {
    redirect(appendRedirectParams(from, { error: "The selected poll needs at least two options before it can be sent." }));
  }

  if (poll && poll.status === "CLOSED") {
    redirect(appendRedirectParams(from, { error: "The selected poll is closed. Re-open it before sending poll links." }));
  }

  const teams = await prisma.team.findMany({
    where: {
      id: {
        in: selectedTeamIds,
      },
    },
    select: {
      id: true,
      name: true,
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
    orderBy: [{ name: "asc" }],
  });

  if (teams.length === 0) {
    redirect(appendRedirectParams(from, { error: "No matching teams were found." }));
  }

  const targetTeams =
    selectedLeagueFilter && selectedLeagueFilter !== ALL_LEAGUES_VALUE
      ? teams.filter((team) => getTeamLeagueLabel(team) === selectedLeagueFilter)
      : teams;

  if (targetTeams.length === 0) {
    redirect(
      appendRedirectParams(from, {
        error: `No selected teams matched the ${selectedLeagueFilter} league filter. Nothing was queued.`,
      }),
    );
  }

  let queuedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const skippedTeamNames: string[] = [];
  const failedTeamNames: string[] = [];

  for (const team of targetTeams) {
    try {
      const leagueName = getTeamLeagueLabel(team);
      const pollToken = poll
        ? await ensurePollRecipient({
            poll,
            team: {
              id: team.id,
              name: team.name,
              contactName: team.contactName,
              contactEmail: team.contactEmail,
              contactPhone: team.contactPhone,
            },
          })
        : null;
      const teamBody = applyPollToMessage({ body, poll, token: pollToken });

      const result = await sendTeamBroadcastMessage({
        teamId: team.id,
        channel,
        subject: channel === NotificationChannel.EMAIL ? subject : null,
        body: teamBody,
        templateId,
        templateKey,
        ctaLabel,
        ctaUrl,
        origin:
          channel === NotificationChannel.SMS
            ? "all_teams_sms_communications_hub"
            : "all_teams_communications_hub",
        originLabel:
          channel === NotificationChannel.SMS
            ? "Sent from all-teams SMS picker"
            : "Sent from all-teams email picker",
        metadata: {
          broadcastType: channel === NotificationChannel.SMS ? "selected_teams_sms" : "selected_teams_email",
          selectedTeamCount: targetTeams.length,
          selectedLeagueFilter:
            selectedLeagueFilter === ALL_LEAGUES_VALUE ? null : selectedLeagueFilter,
          leagueName: team.league ? leagueName : null,
          pollId: poll?.id ?? null,
          pollTitle: poll?.title ?? null,
        },
        createdByUserId: user?.id ?? null,
      });

      if (result.skipped) {
        skippedCount += 1;
        skippedTeamNames.push(team.name);
      } else {
        queuedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      failedTeamNames.push(team.name);

      console.error("All-team communication failed for team", {
        teamId: team.id,
        teamName: team.name,
        channel,
        error: getErrorMessage(error),
      });
    }
  }

  if (queuedCount > 0) {
    await processQueuedTeamMessages(queuedCount);
  }

  if (queuedCount === 0 && failedCount > 0) {
    const failedNames = failedTeamNames.slice(0, 3).join(", ");
    const suffix = failedTeamNames.length > 3 ? ` and ${failedTeamNames.length - 3} more` : "";

    redirect(
      appendRedirectParams(from, {
        error: `No ${queuedNoun} were queued. ${failedCount} team${failedCount === 1 ? "" : "s"} failed${failedNames ? `: ${failedNames}${suffix}` : ""}. Check the server logs for the exact error.`,
      }),
    );
  }

  if (queuedCount === 0 && skippedCount > 0 && failedCount === 0) {
    const skippedNames = skippedTeamNames.slice(0, 3).join(", ");
    const suffix = skippedTeamNames.length > 3 ? ` and ${skippedTeamNames.length - 3} more` : "";

    redirect(
      appendRedirectParams(from, {
        error: `No ${queuedNoun} were queued. ${skippedCount} selected team${skippedCount === 1 ? "" : "s"} were skipped${skippedNames ? `: ${skippedNames}${suffix}` : ""}. Check the team contact ${getMissingContactLabel(channel)}.`,
      }),
    );
  }

  const params: Record<string, string | number> = {
    saved: "queued",
    channel: channel.toLowerCase(),
    count: queuedCount,
    skipped: skippedCount,
    failed: failedCount,
  };

  if (selectedLeagueFilter !== ALL_LEAGUES_VALUE) {
    params.warning = `League filter applied: ${selectedLeagueFilter}. ${targetTeams.length} selected team${targetTeams.length === 1 ? "" : "s"} matched this league.`;
  }

  if (skippedCount > 0) {
    const skippedNames = skippedTeamNames.slice(0, 3).join(", ");
    const suffix = skippedTeamNames.length > 3 ? ` and ${skippedTeamNames.length - 3} more` : "";
    params.warning = `${skippedCount} team${skippedCount === 1 ? "" : "s"} skipped${skippedNames ? `: ${skippedNames}${suffix}` : ""}.`;
  }

  if (failedCount > 0) {
    const failedNames = failedTeamNames.slice(0, 3).join(", ");
    const suffix = failedTeamNames.length > 3 ? ` and ${failedTeamNames.length - 3} more` : "";
    params.warning = `${failedCount} team${failedCount === 1 ? "" : "s"} failed${failedNames ? `: ${failedNames}${suffix}` : ""}.`;
  }

  redirect(appendRedirectParams(from, params));
}
