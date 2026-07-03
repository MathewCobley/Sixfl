// ========================================
// File: src/app/(admin)/admin/fixtures/publish-actions.ts
// ========================================

"use server";

import { NotificationDispatchStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

type PublishFixtureRecord = {
  id: string;
  kickoffAt: Date;
  pitch: string | null;
  matchFeePence: number | null;
  homeTeam: { id: string; name: string; logoUrl: string | null };
  awayTeam: { id: string; name: string; logoUrl: string | null };
  venue: { name: string } | null;
};

type PublishScope = {
  leagueId: string;
  round?: number;
  divisionId?: string | null;
};

const SERIALIZABLE_RETRY_LIMIT = 3;
const PUBLISH_RETRY_ERROR = "fixture_publish_retry_conflict";
const DEFAULT_MATCH_FEE_PENCE = 4000;

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();
  if (!str) throw new Error(`${fieldName} is required.`);
  return str;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseRequiredPositiveInt(value: FormDataEntryValue | null, fieldName: string) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName} must be a whole number of 1 or more.`);
  }
  return parsed;
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

function buildAbsoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

function buildAdminFixturesHref(input: {
  publish: "success" | "none" | "error";
  leagueId: string;
  round?: number;
  divisionId?: string | null;
  published?: number;
  digestQueued?: number;
  digestSkipped?: number;
  reminderQueued?: number;
  reminderSkipped?: number;
  paymentChargesCreated?: number;
  paymentMessagesQueued?: number;
  paymentMessagesSkipped?: number;
  publishError?: string;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("publish", input.publish);
  searchParams.set("leagueId", input.leagueId);
  if (typeof input.round === "number") searchParams.set("round", String(input.round));
  if (input.divisionId) searchParams.set("divisionId", input.divisionId);
  if (typeof input.published === "number") searchParams.set("published", String(input.published));
  if (typeof input.digestQueued === "number") searchParams.set("digestQueued", String(input.digestQueued));
  if (typeof input.digestSkipped === "number") searchParams.set("digestSkipped", String(input.digestSkipped));
  if (typeof input.reminderQueued === "number") searchParams.set("reminderQueued", String(input.reminderQueued));
  if (typeof input.reminderSkipped === "number") searchParams.set("reminderSkipped", String(input.reminderSkipped));
  if (typeof input.paymentChargesCreated === "number") searchParams.set("paymentChargesCreated", String(input.paymentChargesCreated));
  if (typeof input.paymentMessagesQueued === "number") searchParams.set("paymentMessagesQueued", String(input.paymentMessagesQueued));
  if (typeof input.paymentMessagesSkipped === "number") searchParams.set("paymentMessagesSkipped", String(input.paymentMessagesSkipped));
  if (input.publishError?.trim()) searchParams.set("publishError", input.publishError.trim());
  return `/admin/fixtures?${searchParams.toString()}`;
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

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildFixtureLine(fixture: PublishFixtureRecord) {
  return `${formatKickoff(fixture.kickoffAt)} — ${fixture.homeTeam.name} vs ${fixture.awayTeam.name} — ${fixture.pitch ?? "Pitch TBC"} — ${fixture.venue?.name ?? "Venue TBC"}`;
}

function isQueuedDispatch(status: NotificationDispatchStatus) {
  return status === NotificationDispatchStatus.QUEUED;
}

function getLeagueDisplayName(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} — ${league.season}` : league.name;
}

function getTeamDetailsForFixture(fixture: PublishFixtureRecord, teamId: string) {
  return fixture.homeTeam.id === teamId ? fixture.homeTeam : fixture.awayTeam;
}

function buildDigestSourceId(input: { leagueId: string; teamId: string; fixtureIds: string[] }) {
  return `${input.leagueId}:${input.teamId}:${input.fixtureIds.slice().sort().join(",")}`;
}

function buildReminderSourceId(input: { fixtureId: string; teamId: string; scheduledFor: Date }) {
  return `${input.fixtureId}:${input.teamId}:${input.scheduledFor.toISOString()}`;
}

function isRetryablePublishError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P2034";
  return error instanceof Error && error.message === PUBLISH_RETRY_ERROR;
}

async function withSerializableRetry<T>(callback: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (attempt < SERIALIZABLE_RETRY_LIMIT) {
    try {
      return await callback();
    } catch (error) {
      attempt += 1;
      if (!isRetryablePublishError(error) || attempt >= SERIALIZABLE_RETRY_LIMIT) throw error;
    }
  }
  throw new Error("Unable to complete fixture publish.");
}

async function assertDivisionBelongsToLeague(input: PublishScope) {
  if (!input.divisionId) return;
  const division = await prisma.leagueDivision.findFirst({
    where: { id: input.divisionId, leagueId: input.leagueId },
    select: { id: true },
  });
  if (!division) throw new Error("Division does not belong to this league.");
}

async function claimUnpublishedLeagueFixtures(input: PublishScope): Promise<PublishFixtureRecord[]> {
  await assertDivisionBelongsToLeague(input);

  return withSerializableRetry(async () => {
    return prisma.$transaction(
      async (tx) => {
        const where = {
          leagueId: input.leagueId,
          publishedAt: null,
          ...(typeof input.round === "number" ? { round: input.round } : {}),
          ...(input.divisionId ? { divisionId: input.divisionId } : {}),
        };

        const unpublishedFixtures = await tx.fixture.findMany({
          where,
          orderBy: { kickoffAt: "asc" },
          select: {
            id: true,
            kickoffAt: true,
            pitch: true,
            matchFeePence: true,
            homeTeam: { select: { id: true, name: true, logoUrl: true } },
            awayTeam: { select: { id: true, name: true, logoUrl: true } },
            venue: { select: { name: true } },
          },
        });

        if (unpublishedFixtures.length === 0) return [];

        const fixtureIds = unpublishedFixtures.map((fixture) => fixture.id);
        const updateResult = await tx.fixture.updateMany({
          where: {
            id: { in: fixtureIds },
            leagueId: input.leagueId,
            publishedAt: null,
            ...(typeof input.round === "number" ? { round: input.round } : {}),
            ...(input.divisionId ? { divisionId: input.divisionId } : {}),
          },
          data: { publishedAt: new Date() },
        });

        if (updateResult.count !== fixtureIds.length) throw new Error(PUBLISH_RETRY_ERROR);
        return unpublishedFixtures;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });
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
  createdByUserId?: string | null;
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
    createdByUserId: input.createdByUserId,
  });

  return { status: dispatch.status } as const;
}

async function publishAndEmailFixtureBatch(input: PublishScope) {
  try {
    getEmailReplyDomain();
  } catch {
    redirect(buildAdminFixturesHref({ publish: "error", leagueId: input.leagueId, round: input.round, divisionId: input.divisionId, publishError: "reply_not_configured" }));
  }

  const league = await prisma.league.findUnique({
    where: { id: input.leagueId },
    select: { id: true, name: true, slug: true, season: true },
  });
  if (!league) throw new Error("League not found.");

  const unpublishedFixtures = await claimUnpublishedLeagueFixtures(input);

  if (unpublishedFixtures.length === 0) {
    revalidatePath("/admin/fixtures");
    revalidatePath(`/admin/leagues/${input.leagueId}`);
    revalidatePath(`/admin/leagues/${input.leagueId}/fixtures`);
    if (league.slug) {
      revalidatePath(`/leagues/${league.slug}`);
      revalidatePath(`/leagues/${league.slug}/fixtures`);
    }
    redirect(buildAdminFixturesHref({ publish: "none", leagueId: input.leagueId, round: input.round, divisionId: input.divisionId }));
  }

  const teamIds = unique(unpublishedFixtures.flatMap((fixture) => [fixture.homeTeam.id, fixture.awayTeam.id]));
  const fixturesUrl = buildAbsoluteUrl(`/leagues/${league.slug}/fixtures`);
  const leagueDisplayName = getLeagueDisplayName(league);
  let digestQueued = 0;
  let digestSkipped = 0;
  let reminderQueued = 0;
  let reminderSkipped = 0;
  let paymentChargesCreated = 0;
  let paymentMessagesQueued = 0;
  let paymentMessagesSkipped = 0;

  for (const fixture of unpublishedFixtures) {
    const matchFeePence = fixture.matchFeePence ?? DEFAULT_MATCH_FEE_PENCE;
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

    paymentChargesCreated += chargeResult.activeCharges.length;

    const messageResult = await queueFixtureMatchFeeEmails({
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

    paymentMessagesQueued += messageResult.queued;
    paymentMessagesSkipped += messageResult.skipped;
  }

  for (const teamId of teamIds) {
    const { snapshot, recipient } = await upsertTeamNotificationRecipient(teamId);
    const teamFixtures = unpublishedFixtures.filter((fixture) => fixture.homeTeam.id === teamId || fixture.awayTeam.id === teamId);
    if (teamFixtures.length === 0) continue;
    const teamDetails = getTeamDetailsForFixture(teamFixtures[0], teamId);
    const digestDispatch = await queueTemplateNotificationOnce({
      recipientId: recipient.id,
      templateKey: "fixture-publish-digest-email",
      sourceType: "LEAGUE_FIXTURE_DIGEST",
      sourceId: buildDigestSourceId({ leagueId: league.id, teamId, fixtureIds: teamFixtures.map((fixture) => fixture.id) }),
      metadata: {
        kind: "fixture_publish_digest",
        teamId,
        teamName: snapshot.teamName || teamDetails.name,
        leagueId: league.id,
        leagueName: leagueDisplayName,
        publishRound: input.round ?? null,
        divisionId: input.divisionId ?? null,
        fixtureIds: teamFixtures.map((fixture) => fixture.id),
      },
      variables: {
        firstName: snapshot.primaryContact.name ?? snapshot.teamName,
        leagueName: league.name,
        leagueDisplayName,
        fixturesList: teamFixtures.map((fixture) => buildFixtureLine(fixture)).join("\n"),
        fixturesUrl,
      },
      emailBranding: { teamName: snapshot.teamName || teamDetails.name, teamLogoUrl: teamDetails.logoUrl ?? null, leagueName: leagueDisplayName },
    });
    if (isQueuedDispatch(digestDispatch.status)) digestQueued += 1;
    else digestSkipped += 1;
  }

  for (const fixture of unpublishedFixtures) {
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
            publishRound: input.round ?? null,
            divisionId: input.divisionId ?? null,
            fixtureId: fixture.id,
            fixtureName,
          },
          scheduledFor,
          variables: {
            firstName: recipient.displayName?.trim() || teamDetails.name,
            leagueName: league.name,
            fixtureName,
            kickoffLabel: formatKickoff(fixture.kickoffAt),
            fixturesUrl,
          },
          emailBranding: { teamName: teamDetails.name, teamLogoUrl: teamDetails.logoUrl ?? null, leagueName: leagueDisplayName },
        });
        if (isQueuedDispatch(reminderDispatch.status)) reminderQueued += 1;
        else reminderSkipped += 1;
      }
    }
  }

  revalidatePath("/admin/fixtures");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/night-board");
  revalidatePath(`/admin/leagues/${input.leagueId}`);
  revalidatePath(`/admin/leagues/${input.leagueId}/fixtures`);
  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  redirect(buildAdminFixturesHref({
    publish: "success",
    leagueId: input.leagueId,
    round: input.round,
    divisionId: input.divisionId,
    published: unpublishedFixtures.length,
    digestQueued,
    digestSkipped,
    reminderQueued,
    reminderSkipped,
    paymentChargesCreated,
    paymentMessagesQueued,
    paymentMessagesSkipped,
  }));
}

export async function publishAndEmailLeagueFixturesAction(formData: FormData) {
  await requireAdmin();
  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const divisionId = parseOptionalString(formData.get("divisionId"));
  await publishAndEmailFixtureBatch({ leagueId, divisionId });
}

export async function publishAndEmailLeagueFixtureWeekAction(formData: FormData) {
  await requireAdmin();
  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const round = parseRequiredPositiveInt(formData.get("round"), "Week");
  const divisionId = parseOptionalString(formData.get("divisionId"));
  await publishAndEmailFixtureBatch({ leagueId, round, divisionId });
}
