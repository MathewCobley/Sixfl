import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";

import { sendTeamBroadcastMessage } from "@/lib/communications/send-team-broadcast";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";
import {
  addWeeks,
  getWeekStartForDate,
  listTeamWeekUnavailability,
} from "@/lib/team-week-unavailability";

export const LAST_MINUTE_REPLACEMENT_EMAIL_TEMPLATE_KEY =
  "last-minute-replacement-fixture-email";
export const LAST_MINUTE_REPLACEMENT_SMS_TEMPLATE_KEY =
  "last-minute-replacement-fixture-sms";

const DEFAULT_EMAIL_SUBJECT =
  "Free fixture available {{fixtureDate}} at {{fixtureTime}}";
const DEFAULT_EMAIL_BODY = [
  "Hi {{firstName}},",
  "",
  "We have a last-minute fixture available for {{teamName}} in {{leagueName}}.",
  "",
  "Date: {{fixtureDateLong}}",
  "Kick-off: {{fixtureTime}}",
  "Opponent: {{opponentName}}",
  "Venue: {{venueName}}",
  "Pitch: {{pitch}}",
  "",
  "There is no charge for this fixture. It is available on a first-come basis.",
  "",
  "If you would like to take it, reply to this message as soon as possible and we will confirm the place.",
  "",
  "Thanks,",
  "SIXFL",
].join("\n");
const DEFAULT_SMS_BODY =
  "SIXFL: Free fixture available {{fixtureDate}} at {{fixtureTime}} v {{opponentName}}, {{venueName}}. No charge. First come basis. Reply ASAP if {{teamName}} wants it.";

function getTemplateDescription(channel: "email" | "SMS") {
  return [
    `System ${channel} sent when an admin marks a team as needing a last-minute replacement on the Night Board.`,
    "Editable tokens: {{firstName}}, {{teamName}}, {{leagueName}}, {{fixtureDate}}, {{fixtureDateLong}}, {{fixtureTime}}, {{opponentName}}, {{venueName}}, {{pitch}}.",
  ].join(" ");
}

export async function ensureLastMinuteReplacementTemplates() {
  const existing = await prisma.notificationTemplate.findMany({
    where: {
      key: {
        in: [
          LAST_MINUTE_REPLACEMENT_EMAIL_TEMPLATE_KEY,
          LAST_MINUTE_REPLACEMENT_SMS_TEMPLATE_KEY,
        ],
      },
    },
    select: { key: true },
  });
  const keys = new Set(existing.map((template) => template.key));

  if (!keys.has(LAST_MINUTE_REPLACEMENT_EMAIL_TEMPLATE_KEY)) {
    await prisma.notificationTemplate
      .create({
        data: {
          key: LAST_MINUTE_REPLACEMENT_EMAIL_TEMPLATE_KEY,
          name: "Last-minute replacement fixture email",
          description: getTemplateDescription("email"),
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.TEAM,
          subject: DEFAULT_EMAIL_SUBJECT,
          body: DEFAULT_EMAIL_BODY,
          ctaLabel: null,
          ctaUrlKey: null,
          isActive: true,
        },
      })
      .catch((error: unknown) => {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          (error as { code?: string }).code !== "P2002"
        ) {
          throw error;
        }
      });
  }

  if (!keys.has(LAST_MINUTE_REPLACEMENT_SMS_TEMPLATE_KEY)) {
    await prisma.notificationTemplate
      .create({
        data: {
          key: LAST_MINUTE_REPLACEMENT_SMS_TEMPLATE_KEY,
          name: "Last-minute replacement fixture SMS",
          description: getTemplateDescription("SMS"),
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: NotificationChannel.SMS,
          audience: NotificationAudience.TEAM,
          subject: null,
          body: DEFAULT_SMS_BODY,
          ctaLabel: null,
          ctaUrlKey: null,
          isActive: true,
        },
      })
      .catch((error: unknown) => {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          (error as { code?: string }).code !== "P2002"
        ) {
          throw error;
        }
      });
  }
}

function formatFixtureDate(value: Date, long = false) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(long ? { year: "numeric", weekday: "long" as const, month: "long" as const } : {}),
  }).format(value);
}

function formatFixtureTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

async function getActiveLeagueTeamIds(leagueId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ teamId: string }>>(Prisma.sql`
      SELECT DISTINCT membership."teamId" AS "teamId"
      FROM "LeagueSeasonTeam" membership
      JOIN "Team" team ON team."id" = membership."teamId"
      WHERE membership."leagueId" = ${leagueId}
        AND membership."isActive" = TRUE
        AND COALESCE(team."isFixturePlaceholder", FALSE) = FALSE
        AND LOWER(TRIM(team."name")) <> 'tbc'
      ORDER BY membership."teamId"
    `);
    if (rows.length > 0) return rows.map((row) => row.teamId);
  } catch (error) {
    console.error("Could not load active league-season teams for replacement alert", error);
  }

  const fallback = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true },
  });
  return fallback.map((team) => team.id);
}

export type LastMinuteReplacementAlertResult = {
  eligibleTeams: Array<{ id: string; name: string }>;
  excludedNightOff: number;
  excludedAlreadyPlaying: number;
  email: { sent: number; skipped: number; failed: number; queued: number };
  sms: { sent: number; skipped: number; failed: number; queued: number };
};

export async function sendLastMinuteReplacementAlert(input: {
  fixtureId: string;
  droppedTeamId: string;
  createdByUserId?: string | null;
}): Promise<LastMinuteReplacementAlertResult> {
  await ensureLastMinuteReplacementTemplates();

  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      pitch: true,
      publishedAt: true,
      status: true,
      league: { select: { name: true, season: true, venueName: true } },
      venue: { select: { name: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  if (!fixture) throw new Error("Fixture not found.");
  if (!fixture.publishedAt || fixture.status !== "SCHEDULED") {
    throw new Error("Only a published, scheduled fixture can request a last-minute replacement.");
  }
  if (fixture.kickoffAt <= new Date()) {
    throw new Error("This fixture has already started.");
  }
  if (
    input.droppedTeamId !== fixture.homeTeam.id &&
    input.droppedTeamId !== fixture.awayTeam.id
  ) {
    throw new Error("The selected team is not part of this fixture.");
  }

  const opponent =
    input.droppedTeamId === fixture.homeTeam.id
      ? fixture.awayTeam
      : fixture.homeTeam;
  const leagueTeamIds = await getActiveLeagueTeamIds(fixture.leagueId);
  const weekStart = getWeekStartForDate(fixture.kickoffAt);
  const weekEnd = addWeeks(weekStart, 1);

  const [unavailability, occupiedFixtures] = await Promise.all([
    listTeamWeekUnavailability({
      teamIds: leagueTeamIds,
      from: weekStart,
      to: weekEnd,
    }),
    leagueTeamIds.length
      ? prisma.fixture.findMany({
          where: {
            publishedAt: { not: null },
            status: "SCHEDULED",
            kickoffAt: fixture.kickoffAt,
            OR: [
              { homeTeamId: { in: leagueTeamIds } },
              { awayTeamId: { in: leagueTeamIds } },
            ],
          },
          select: { homeTeamId: true, awayTeamId: true },
        })
      : Promise.resolve([]),
  ]);

  const nightOffTeamIds = new Set(unavailability.map((row) => row.teamId));
  const alreadyPlayingTeamIds = new Set(
    occupiedFixtures.flatMap((item) => [item.homeTeamId, item.awayTeamId]),
  );

  const eligibleIds = leagueTeamIds.filter(
    (teamId) =>
      teamId !== input.droppedTeamId &&
      !nightOffTeamIds.has(teamId) &&
      !alreadyPlayingTeamIds.has(teamId),
  );
  const eligibleTeams = eligibleIds.length
    ? await prisma.team.findMany({
        where: { id: { in: eligibleIds } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const templates = await prisma.notificationTemplate.findMany({
    where: {
      key: {
        in: [
          LAST_MINUTE_REPLACEMENT_EMAIL_TEMPLATE_KEY,
          LAST_MINUTE_REPLACEMENT_SMS_TEMPLATE_KEY,
        ],
      },
      isActive: true,
    },
    select: {
      id: true,
      key: true,
      channel: true,
      subject: true,
      body: true,
    },
  });
  const emailTemplate = templates.find(
    (template) => template.key === LAST_MINUTE_REPLACEMENT_EMAIL_TEMPLATE_KEY,
  );
  const smsTemplate = templates.find(
    (template) => template.key === LAST_MINUTE_REPLACEMENT_SMS_TEMPLATE_KEY,
  );

  if (!emailTemplate && !smsTemplate) {
    throw new Error("Both last-minute replacement message templates are inactive.");
  }

  const variables = {
    leagueName: `${fixture.league.name}${fixture.league.season ? ` — ${fixture.league.season}` : ""}`,
    fixtureDate: formatFixtureDate(fixture.kickoffAt),
    fixtureDateLong: formatFixtureDate(fixture.kickoffAt, true),
    fixtureTime: formatFixtureTime(fixture.kickoffAt),
    opponentName: opponent.name,
    venueName: fixture.venue?.name || fixture.league.venueName || "Venue TBC",
    pitch: fixture.pitch?.trim() || "TBC",
  };

  const dispatchIds: string[] = [];
  for (const team of eligibleTeams) {
    if (emailTemplate) {
      const result = await sendTeamBroadcastMessage({
        teamId: team.id,
        channel: NotificationChannel.EMAIL,
        subject: emailTemplate.subject || DEFAULT_EMAIL_SUBJECT,
        body: emailTemplate.body,
        templateId: emailTemplate.id,
        templateKey: emailTemplate.key,
        origin: "night-board-last-minute-replacement",
        originLabel: "Last-minute replacement fixture",
        variables,
        metadata: {
          event: "fixture.last_minute_replacement.email",
          fixtureId: fixture.id,
          droppedTeamId: input.droppedTeamId,
          opponentTeamId: opponent.id,
          kickoffAt: fixture.kickoffAt.toISOString(),
        },
        createdByUserId: input.createdByUserId ?? null,
      });
      dispatchIds.push(result.dispatchId);
    }

    if (smsTemplate) {
      const result = await sendTeamBroadcastMessage({
        teamId: team.id,
        channel: NotificationChannel.SMS,
        body: smsTemplate.body,
        templateId: smsTemplate.id,
        templateKey: smsTemplate.key,
        origin: "night-board-last-minute-replacement",
        originLabel: "Last-minute replacement fixture",
        variables,
        metadata: {
          event: "fixture.last_minute_replacement.sms",
          fixtureId: fixture.id,
          droppedTeamId: input.droppedTeamId,
          opponentTeamId: opponent.id,
          kickoffAt: fixture.kickoffAt.toISOString(),
        },
        createdByUserId: input.createdByUserId ?? null,
      });
      dispatchIds.push(result.dispatchId);
    }
  }

  if (dispatchIds.length > 0) {
    await processNotificationQueue(Math.min(500, Math.max(100, dispatchIds.length + 50)));
  }

  const dispatches = dispatchIds.length
    ? await prisma.notificationDispatch.findMany({
        where: { id: { in: dispatchIds } },
        select: { channel: true, status: true },
      })
    : [];

  function channelSummary(channel: NotificationChannel) {
    const rows = dispatches.filter((dispatch) => dispatch.channel === channel);
    return {
      sent: rows.filter((dispatch) => dispatch.status === NotificationDispatchStatus.SENT).length,
      skipped: rows.filter((dispatch) => dispatch.status === NotificationDispatchStatus.SKIPPED).length,
      failed: rows.filter((dispatch) => dispatch.status === NotificationDispatchStatus.FAILED).length,
      queued: rows.filter((dispatch) =>
        dispatch.status === NotificationDispatchStatus.QUEUED ||
        dispatch.status === NotificationDispatchStatus.PROCESSING,
      ).length,
    };
  }

  return {
    eligibleTeams,
    excludedNightOff: leagueTeamIds.filter((id) => nightOffTeamIds.has(id)).length,
    excludedAlreadyPlaying: leagueTeamIds.filter((id) => alreadyPlayingTeamIds.has(id)).length,
    email: channelSummary(NotificationChannel.EMAIL),
    sms: channelSummary(NotificationChannel.SMS),
  };
}
