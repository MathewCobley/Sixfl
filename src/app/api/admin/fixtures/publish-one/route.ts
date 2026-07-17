import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { NotificationDispatchStatus, Prisma } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";
import {
  queueFixtureMatchFeeEmails,
  syncFixtureMatchFeeCharges,
} from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEmailReplyDomain } from "@/lib/resend/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_MATCH_FEE_PENCE = 4000;

type PublishFixtureRecord = {
  id: string;
  leagueId: string;
  kickoffAt: Date;
  pitch: string | null;
  matchFeePence: number | null;
  homeTeam: { id: string; name: string; logoUrl: string | null };
  awayTeam: { id: string; name: string; logoUrl: string | null };
  venue: { name: string } | null;
};

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://www.sixfl.co.uk"
  );
}

function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

function formatKickoff(date: Date) {
  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLeagueDisplayName(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} — ${league.season}` : league.name;
}

function getTeamDetailsForFixture(fixture: PublishFixtureRecord, teamId: string) {
  return fixture.homeTeam.id === teamId ? fixture.homeTeam : fixture.awayTeam;
}

function buildReminderSourceId(input: { fixtureId: string; teamId: string; scheduledFor: Date }) {
  return `${input.fixtureId}:${input.teamId}:${input.scheduledFor.toISOString()}`;
}

function isQueuedDispatch(status: NotificationDispatchStatus) {
  return status === NotificationDispatchStatus.QUEUED;
}

function normaliseFixtureIds(value: string | null) {
  return Array.from(new Set((value ?? "").split(",").map((id) => id.trim()).filter(Boolean))).slice(0, 100);
}

async function queueTemplateNotificationOnce(input: {
  recipientId: string;
  templateKey: string;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  variables?: Record<string, string | null | undefined>;
  emailBranding?: { teamName?: string | null; teamLogoUrl?: string | null; leagueName?: string | null };
  scheduledFor?: Date;
}) {
  const sourceType = input.sourceType?.trim() || null;
  const sourceId = input.sourceId?.trim() || null;

  if (sourceType && sourceId) {
    const existingDispatch = await prisma.notificationDispatch.findFirst({
      where: {
        sourceType,
        sourceId,
        status: {
          in: [NotificationDispatchStatus.QUEUED, NotificationDispatchStatus.PROCESSING, NotificationDispatchStatus.SENT],
        },
      },
      select: { id: true },
    });

    if (existingDispatch) return { status: NotificationDispatchStatus.SKIPPED } as const;
  }

  const dispatch = await queueNotificationFromTemplate({
    templateKey: input.templateKey,
    recipientId: input.recipientId,
    sourceType,
    sourceId,
    metadata: input.metadata,
    variables: input.variables,
    emailBranding: input.emailBranding,
    scheduledFor: input.scheduledFor,
  });

  return { status: dispatch.status } as const;
}

async function getPublishFixtureRecord(fixtureId: string) {
  return prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: {
      id: true,
      leagueId: true,
      kickoffAt: true,
      pitch: true,
      matchFeePence: true,
      publishedAt: true,
      league: { select: { id: true, name: true, slug: true, season: true } },
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
      venue: { select: { name: true } },
    },
  });
}

async function publishFixtureOrNull(fixtureId: string) {
  return prisma.$transaction(
    async (tx) => {
      const fixture = await tx.fixture.findUnique({
        where: { id: fixtureId },
        select: {
          id: true,
          leagueId: true,
          kickoffAt: true,
          pitch: true,
          matchFeePence: true,
          publishedAt: true,
          homeTeam: { select: { id: true, name: true, logoUrl: true } },
          awayTeam: { select: { id: true, name: true, logoUrl: true } },
          venue: { select: { name: true } },
        },
      });

      if (!fixture || fixture.publishedAt) return null;

      const update = await tx.fixture.updateMany({
        where: { id: fixtureId, publishedAt: null },
        data: { publishedAt: new Date() },
      });

      if (update.count !== 1) return null;

      return fixture;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function queueEverythingForPublishedFixture(input: {
  fixture: PublishFixtureRecord;
  league: { id: string; name: string; slug: string | null; season: string | null };
}) {
  const { fixture, league } = input;
  const matchFeePence = fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;
  const leagueDisplayName = getLeagueDisplayName(league);
  const fixturesUrl = league.slug
    ? buildAbsoluteUrl(`/leagues/${league.slug}/fixtures`)
    : buildAbsoluteUrl("/leagues");

  const chargeResult = await syncFixtureMatchFeeCharges({
    fixtureId: fixture.id,
    leagueId: league.id,
    leagueName: league.name,
    leagueSeason: league.season,
    kickoffAt: fixture.kickoffAt,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeMatchFeePence: matchFeePence,
    awayMatchFeePence: matchFeePence,
  });

  const paymentResult = await queueFixtureMatchFeeEmails({
    fixtureId: fixture.id,
    leagueId: league.id,
    leagueName: league.name,
    leagueSeason: league.season,
    kickoffAt: fixture.kickoffAt,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    homeMatchFeePence: matchFeePence,
    awayMatchFeePence: matchFeePence,
    charges: chargeResult.activeCharges,
  });

  let digestQueued = 0;
  let digestSkipped = 0;
  let reminderQueued = 0;
  let reminderSkipped = 0;

  for (const teamId of [fixture.homeTeam.id, fixture.awayTeam.id]) {
    const { recipient } = await upsertTeamNotificationRecipient(teamId);
    const teamDetails = getTeamDetailsForFixture(fixture, teamId);
    const fixtureName = `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;

    const reminderTimes = [
      new Date(fixture.kickoffAt.getTime() - 48 * 60 * 60 * 1000),
      new Date(fixture.kickoffAt.getTime() - 6 * 60 * 60 * 1000),
    ].filter((date) => date.getTime() > Date.now());

    for (const scheduledFor of reminderTimes) {
      const reminderDispatch = await queueTemplateNotificationOnce({
        recipientId: recipient.id,
        templateKey: "fixture-reminder-email",
        sourceType: "FIXTURE_REMINDER",
        sourceId: buildReminderSourceId({ fixtureId: fixture.id, teamId, scheduledFor }),
        metadata: {
          kind: "fixture_reminder",
          teamId,
          teamName: teamDetails.name,
          leagueId: league.id,
          leagueName: leagueDisplayName,
          fixtureId: fixture.id,
          fixtureName,
          individualPublish: true,
        },
        scheduledFor,
        variables: {
          firstName: recipient.displayName?.trim() || teamDetails.name,
          leagueName: league.name,
          fixtureName,
          kickoffLabel: formatKickoff(fixture.kickoffAt),
          fixturesUrl,
        },
        emailBranding: {
          teamName: teamDetails.name,
          teamLogoUrl: teamDetails.logoUrl ?? null,
          leagueName: leagueDisplayName,
        },
      });

      if (isQueuedDispatch(reminderDispatch.status)) reminderQueued += 1;
      else reminderSkipped += 1;
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/night-board");
  revalidatePath(`/admin/leagues/${league.id}`);
  revalidatePath(`/admin/leagues/${league.id}/fixtures`);
  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  return {
    paymentChargesCreated: chargeResult.activeCharges.length,
    paymentMessagesQueued: paymentResult.queued,
    paymentMessagesSkipped: paymentResult.skipped,
    digestQueued,
    digestSkipped,
    reminderQueued,
    reminderSkipped,
  };
}

export async function GET(request: Request) {
  await requireAdmin();

  const url = new URL(request.url);
  const ids = normaliseFixtureIds(url.searchParams.get("ids"));

  if (ids.length === 0) {
    return NextResponse.json({ fixtures: [] });
  }

  const rows = await prisma.fixture.findMany({
    where: { id: { in: ids } },
    select: { id: true, publishedAt: true },
  });

  return NextResponse.json({
    fixtures: rows.map((row) => ({
      id: row.id,
      published: Boolean(row.publishedAt),
      publishedAt: row.publishedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  await requireAdmin();

  const body = (await request.json().catch(() => null)) as { fixtureId?: string } | null;
  const fixtureId = body?.fixtureId?.trim() ?? "";

  if (!fixtureId) {
    return NextResponse.json({ ok: false, error: "Fixture ID is required." }, { status: 400 });
  }

  try {
    getEmailReplyDomain();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Reply-by-email is not configured. Add EMAIL_REPLY_DOMAIN before publishing fixtures." },
      { status: 400 },
    );
  }

  const fixtureInfo = await getPublishFixtureRecord(fixtureId);
  if (!fixtureInfo) {
    return NextResponse.json({ ok: false, error: "Fixture not found." }, { status: 404 });
  }

  if (fixtureInfo.publishedAt) {
    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });
  }

  const fixture = await publishFixtureOrNull(fixtureId);
  if (!fixture) {
    return NextResponse.json({ ok: true, published: false, alreadyPublished: true });
  }

  const stats = await queueEverythingForPublishedFixture({
    fixture,
    league: fixtureInfo.league,
  });

  return NextResponse.json({
    ok: true,
    published: true,
    fixtureId,
    ...stats,
  });
}
