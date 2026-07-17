import {
  FixtureCaptainConfirmationStatus,
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";

type ConfirmationEmailMode = "initial" | "auto72h" | "auto24h";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.sixfl.co.uk"
  );
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

  if (input.mode === "auto24h") {
    return {
      subject: `Urgent: confirm ${fixtureLabel}`,
      body: `Your fixture is now within 24 hours and still needs confirming.\n\nFixture: ${fixtureLabel}\nKickoff: ${kickoffLabel}\n\nPlease confirm now or raise an issue using the button below.`,
    };
  }

  if (input.mode === "auto72h") {
    return {
      subject: `Reminder: confirm ${fixtureLabel}`,
      body: `We are still waiting for confirmation of your upcoming fixture.\n\nFixture: ${fixtureLabel}\nKickoff: ${kickoffLabel}\n\nPlease confirm the fixture or raise an issue using the button below.`,
    };
  }

  return {
    subject: `Please confirm ${fixtureLabel}`,
    body: `A new SIXFL fixture is live and needs your confirmation.\n\nFixture: ${fixtureLabel}\nKickoff: ${kickoffLabel}\n\nPlease confirm the fixture or raise an issue using the button below.`,
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

  const summary = {
    scannedFixtures: fixtures.length,
    queued: 0,
    alreadySent: 0,
    skipped: 0,
    noEmail: 0,
  };

  for (const fixture of fixtures) {
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
          label: mode === "auto24h" ? "Confirm fixture now" : "Confirm fixture",
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
