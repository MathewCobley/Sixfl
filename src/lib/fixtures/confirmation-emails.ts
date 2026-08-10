import {
  FixtureCaptainConfirmationStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

type ConfirmationEmailMode = "initial" | "auto72h" | "auto24h";

export type InitialFixtureConfirmationQueueResult =
  | "queued"
  | "already-sent"
  | "no-email"
  | "skipped";

const CANONICAL_SITE_URL = "https://sixfl.co.uk";
const FIXTURE_RESPONSE_LOCK_HOURS = 72;
const SIXFL_FIXTURE_EMAIL = "hello@sixfl.co.uk";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getSiteUrl() {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    CANONICAL_SITE_URL
  ).replace(/\/+$/, "");

  return /^https:\/\/www\.sixfl\.co\.uk$/i.test(configured)
    ? CANONICAL_SITE_URL
    : configured;
}

function formatKickoff(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function getSourceType(mode: ConfirmationEmailMode) {
  if (mode === "initial") return "FIXTURE_CONFIRMATION_INITIAL_EMAIL";
  if (mode === "auto24h") return "FIXTURE_CONFIRMATION_AUTO_EMAIL_24H";
  return "FIXTURE_CONFIRMATION_AUTO_EMAIL_72H";
}

function getEmailCopy(input: {
  mode: ConfirmationEmailMode;
  teamName: string;
  opponentName: string;
  kickoffAt: Date;
}) {
  const fixtureLabel = `${input.teamName} v ${input.opponentName}`;
  const kickoffLabel = formatKickoff(input.kickoffAt);
  const onlineInstruction =
    `Open the fixture and choose either ‘Yes — we can play’ or ‘No — we cannot play’. This is the whole-team response; individual player availability is separate. Online responses close ${FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off.`;
  const lateInstruction =
    `The online response window closes ${FIXTURE_RESPONSE_LOCK_HOURS} hours before kick-off. If you need to report or change anything inside that window, email ${SIXFL_FIXTURE_EMAIL} directly.`;

  if (input.mode === "auto24h") {
    return {
      subject: `Urgent: contact SIXFL about ${fixtureLabel}`,
      body: `Your fixture is now within 24 hours and SIXFL still needs to know whether your team can play.\n\nFixture: ${fixtureLabel}\nKick-off: ${kickoffLabel}\n\n${lateInstruction}`,
    };
  }

  if (input.mode === "auto72h") {
    return {
      subject: `Fixture response deadline: ${fixtureLabel}`,
      body: `We are still waiting for your team’s response to this upcoming fixture.\n\nFixture: ${fixtureLabel}\nKick-off: ${kickoffLabel}\n\n${lateInstruction}`,
    };
  }

  return {
    subject: `Can your team play ${fixtureLabel}?`,
    body: `A new SIXFL fixture is live and needs a response from your team.\n\nFixture: ${fixtureLabel}\nKick-off: ${kickoffLabel}\n\n${onlineInstruction}`,
  };
}

async function hasDispatch(input: {
  sourceType: string;
  sourceId: string;
}) {
  const dispatch = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    select: { id: true },
  });

  return Boolean(dispatch);
}

export async function queueInitialFixtureConfirmationEmailForTeam(input: {
  fixtureId: string;
  teamId: string;
}): Promise<InitialFixtureConfirmationQueueResult> {
  const now = new Date();
  const fixture = await prisma.fixture.findUnique({
    where: { id: input.fixtureId },
    select: {
      id: true,
      leagueId: true,
      publishedAt: true,
      status: true,
      kickoffAt: true,
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      league: { select: { name: true, season: true } },
      captainConfirmations: {
        where: { teamId: input.teamId },
        select: { status: true },
        take: 1,
      },
    },
  });

  if (
    !fixture ||
    !fixture.publishedAt ||
    fixture.status !== "SCHEDULED" ||
    fixture.kickoffAt <= now
  ) {
    return "skipped";
  }

  if (
    input.teamId !== fixture.homeTeam.id &&
    input.teamId !== fixture.awayTeam.id
  ) {
    return "skipped";
  }

  const placeholderTeamIds = await getFixturePlaceholderTeamIds([
    fixture.homeTeam.id,
    fixture.awayTeam.id,
  ]);
  if (
    placeholderTeamIds.has(fixture.homeTeam.id) ||
    placeholderTeamIds.has(fixture.awayTeam.id)
  ) {
    return "skipped";
  }

  const confirmation = fixture.captainConfirmations[0];
  if (
    confirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED ||
    confirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED
  ) {
    return "skipped";
  }

  const sourceId = `${fixture.id}:${input.teamId}`;
  const sourceType = getSourceType("initial");
  if (await hasDispatch({ sourceType, sourceId })) {
    return "already-sent";
  }

  const team =
    fixture.homeTeam.id === input.teamId ? fixture.homeTeam : fixture.awayTeam;
  const opponent =
    fixture.homeTeam.id === input.teamId ? fixture.awayTeam : fixture.homeTeam;
  const { recipient } = await upsertTeamNotificationRecipient(input.teamId);
  if (!recipient.email?.trim()) return "no-email";

  const captainFixturesUrl = new URL(
    `/captain/team/${input.teamId}/fixtures?fixtureId=${encodeURIComponent(fixture.id)}`,
    getSiteUrl(),
  ).toString();
  const copy = getEmailCopy({
    mode: "initial",
    teamName: team.name,
    opponentName: opponent.name,
    kickoffAt: fixture.kickoffAt,
  });

  const dispatch = await queueDirectNotification({
    recipientId: recipient.id,
    channel: NotificationChannel.EMAIL,
    audience: NotificationAudience.TEAM,
    subject: copy.subject,
    body: copy.body,
    isTransactional: true,
    sourceType,
    sourceId,
    emailBranding: {
      teamName: team.name,
      teamLogoUrl: team.logoUrl ?? null,
      leagueName: fixture.league.season
        ? `${fixture.league.name} — ${fixture.league.season}`
        : fixture.league.name,
    },
    emailCta: {
      label: "Respond to fixture",
      url: captainFixturesUrl,
    },
    metadata: {
      kind: "fixture_confirmation_email",
      mode: "initial",
      trigger: "published_fixture_team_added",
      fixtureId: fixture.id,
      leagueId: fixture.leagueId,
      teamId: input.teamId,
      teamName: team.name,
      opponentName: opponent.name,
    },
  });

  if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
    return "skipped";
  }

  await prisma.fixtureCaptainConfirmation.upsert({
    where: {
      fixtureId_teamId: {
        fixtureId: fixture.id,
        teamId: input.teamId,
      },
    },
    update: {
      status: FixtureCaptainConfirmationStatus.PENDING,
      lastChasedAt: new Date(),
    },
    create: {
      fixtureId: fixture.id,
      teamId: input.teamId,
      status: FixtureCaptainConfirmationStatus.PENDING,
      lastChasedAt: new Date(),
    },
  });

  return "queued";
}

export async function runFixtureConfirmationEmailJob() {
  const now = new Date();
  const urgentCutoff = addHours(now, 24.5);
  const standardCutoff = addHours(now, 72.5);

  const fixtures = await prisma.fixture.findMany({
    where: {
      publishedAt: { not: null },
      status: "SCHEDULED",
      kickoffAt: { gt: now },
    },
    orderBy: { kickoffAt: "asc" },
    take: 250,
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      league: { select: { name: true, season: true } },
      captainConfirmations: {
        select: { teamId: true, status: true },
      },
    },
  });

  const placeholderTeamIds = await getFixturePlaceholderTeamIds(
    fixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]),
  );

  const summary = {
    scannedFixtures: fixtures.length,
    provisionalFixturesSkipped: 0,
    queued: 0,
    alreadySent: 0,
    skipped: 0,
    noEmail: 0,
  };

  for (const fixture of fixtures) {
    const isProvisional =
      placeholderTeamIds.has(fixture.homeTeam.id) ||
      placeholderTeamIds.has(fixture.awayTeam.id);

    if (isProvisional) {
      summary.provisionalFixturesSkipped += 1;
      summary.skipped += 2;
      continue;
    }

    for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {
      const confirmation = fixture.captainConfirmations.find(
        (item) => item.teamId === teamId,
      );

      if (
        confirmation?.status === FixtureCaptainConfirmationStatus.CONFIRMED ||
        confirmation?.status === FixtureCaptainConfirmationStatus.ISSUE_RAISED
      ) {
        summary.skipped += 1;
        continue;
      }

      const team = fixture.homeTeam.id === teamId ? fixture.homeTeam : fixture.awayTeam;
      const opponent = fixture.homeTeam.id === teamId ? fixture.awayTeam : fixture.homeTeam;
      const sourceId = `${fixture.id}:${teamId}`;

      const initialSourceType = getSourceType("initial");
      const initialAlreadySent = await hasDispatch({
        sourceType: initialSourceType,
        sourceId,
      });

      let mode: ConfirmationEmailMode | null = null;

      if (!initialAlreadySent) {
        mode = "initial";
      } else if (fixture.kickoffAt <= urgentCutoff) {
        const sourceType = getSourceType("auto24h");
        if (!(await hasDispatch({ sourceType, sourceId }))) mode = "auto24h";
      } else if (fixture.kickoffAt <= standardCutoff) {
        const sourceType = getSourceType("auto72h");
        if (!(await hasDispatch({ sourceType, sourceId }))) mode = "auto72h";
      }

      if (!mode) {
        summary.alreadySent += 1;
        continue;
      }

      const { recipient } = await upsertTeamNotificationRecipient(teamId);
      if (!recipient.email?.trim()) {
        summary.noEmail += 1;
        continue;
      }

      const captainFixturesUrl = new URL(
        `/captain/team/${teamId}/fixtures?fixtureId=${encodeURIComponent(fixture.id)}`,
        getSiteUrl(),
      ).toString();
      const copy = getEmailCopy({
        mode,
        teamName: team.name,
        opponentName: opponent.name,
        kickoffAt: fixture.kickoffAt,
      });

      const dispatch = await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.TEAM,
        subject: copy.subject,
        body: copy.body,
        isTransactional: true,
        sourceType: getSourceType(mode),
        sourceId,
        emailBranding: {
          teamName: team.name,
          teamLogoUrl: team.logoUrl ?? null,
          leagueName: fixture.league.season
            ? `${fixture.league.name} — ${fixture.league.season}`
            : fixture.league.name,
        },
        emailCta: {
          label: mode === "initial" ? "Respond to fixture" : "Open fixture details",
          url: captainFixturesUrl,
        },
        metadata: {
          kind: "fixture_confirmation_email",
          mode,
          fixtureId: fixture.id,
          leagueId: fixture.leagueId,
          teamId,
          teamName: team.name,
          opponentName: opponent.name,
        },
      });

      if (dispatch.status !== NotificationDispatchStatus.QUEUED) {
        summary.skipped += 1;
        continue;
      }

      await prisma.fixtureCaptainConfirmation.upsert({
        where: {
          fixtureId_teamId: {
            fixtureId: fixture.id,
            teamId,
          },
        },
        update: { lastChasedAt: new Date() },
        create: {
          fixtureId: fixture.id,
          teamId,
          status: FixtureCaptainConfirmationStatus.PENDING,
          lastChasedAt: new Date(),
        },
      });

      summary.queued += 1;
    }
  }

  return summary;
}
