// ========================================
// File: src/app/(admin)/admin/fixtures/page.tsx
// ========================================

import Link from "next/link";
import { FixtureCaptainConfirmationStatus, Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import FixtureMatchupGrid from "@/components/admin/fixtures/FixtureMatchupGrid";
import FixturesAdminScreen from "@/components/admin/fixtures/FixturesAdminScreen";
import {
  publishAndEmailLeagueFixtureWeekAction,
  publishAndEmailLeagueFixturesAction,
} from "@/app/(admin)/admin/fixtures/publish-actions";
import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

type AdminFixturesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PublishNotice = {
  tone: "success" | "info" | "error";
  message: string;
};

type ChaseNotice = {
  tone: "success" | "info" | "error";
  message: string;
};

type FixtureVisibilityFilter = "all" | "published" | "draft";

type SeasonTeamLink = {
  leagueId: string;
  teamId: string;
};

function formatKickoffLabel(date: Date | null) {
  if (!date) return null;

  return formatDateTimeInLondon(date, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function parseFixtureVisibility(value: string | null): FixtureVisibilityFilter {
  if (value === "published" || value === "draft") return value;
  return "all";
}

function formatVisibility(value: FixtureVisibilityFilter) {
  if (value === "published") return "Published only";
  if (value === "draft") return "Draft only";
  return "Published + draft";
}

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function getFixtureDisplayRank(fixture: { status: string; kickoffAt: Date }) {
  if (fixture.status === "COMPLETED") return 2;
  if (fixture.kickoffAt.getTime() < Date.now()) return 1;
  return 0;
}

function buildPublishNotice(input: {
  searchParams: Record<string, string | string[] | undefined>;
  leagues: Array<{ id: string; name: string }>;
}): PublishNotice | null {
  const publish = getSearchParamValue(input.searchParams.publish);
  if (!publish) return null;

  const leagueId = getSearchParamValue(input.searchParams.leagueId);
  const leagueName =
    input.leagues.find((league) => league.id === leagueId)?.name ??
    "this current season";
  const round = getSearchParamValue(input.searchParams.round);
  const scopeLabel = round ? `Week ${round} for ${leagueName}` : leagueName;
  const published = Number(getSearchParamValue(input.searchParams.published) ?? 0);
  const digestQueued = Number(getSearchParamValue(input.searchParams.digestQueued) ?? 0);
  const digestSkipped = Number(getSearchParamValue(input.searchParams.digestSkipped) ?? 0);
  const reminderQueued = Number(getSearchParamValue(input.searchParams.reminderQueued) ?? 0);
  const reminderSkipped = Number(getSearchParamValue(input.searchParams.reminderSkipped) ?? 0);
  const publishError = getSearchParamValue(input.searchParams.publishError);

  if (publish === "success") {
    const summaryParts = [
      `${formatCount(published, "fixture")} published for ${scopeLabel}`,
      `${formatCount(digestQueued, "digest email")} queued`,
      `${formatCount(reminderQueued, "reminder email")} queued`,
    ];

    const skipped = digestSkipped + reminderSkipped;
    if (skipped > 0) {
      summaryParts.push(
        `${formatCount(skipped, "notification")} skipped because team email details were missing or disabled`,
      );
    }

    return { tone: "success", message: `${summaryParts.join(". ")}.` };
  }

  if (publish === "none") {
    return {
      tone: "info",
      message: `No draft fixtures were waiting to be published for ${scopeLabel}.`,
    };
  }

  if (publish === "error" && publishError === "reply_not_configured") {
    return {
      tone: "error",
      message: `Reply-by-email is not configured yet. Add EMAIL_REPLY_DOMAIN in the deployed environment before publishing fixtures for ${scopeLabel}.`,
    };
  }

  if (publish === "error") {
    return {
      tone: "error",
      message: `Publishing fixtures for ${scopeLabel} could not be completed.`,
    };
  }

  return null;
}

function buildChaseNotice(
  searchParams: Record<string, string | string[] | undefined>,
): ChaseNotice | null {
  const notice = getSearchParamValue(searchParams.notice);
  const teamName = getSearchParamValue(searchParams.teamName) ?? "that team";

  if (!notice) return null;
  if (notice === "sms_queued") {
    return { tone: "success", message: `Chase SMS queued for ${teamName}.` };
  }
  if (notice === "sms_skipped") {
    return {
      tone: "info",
      message: `SMS could not be queued for ${teamName}. Check that the team has a usable mobile number and SMS is enabled.`,
    };
  }
  if (notice === "sms_not_available") {
    return {
      tone: "info",
      message: `A chase SMS is not available for ${teamName} on this fixture.`,
    };
  }
  if (notice === "sms_error") {
    return {
      tone: "error",
      message: "Something went wrong while trying to queue the chase SMS.",
    };
  }
  return null;
}

function getFallbackConfirmationStatus(kickoffAt: Date) {
  const diffMs = kickoffAt.getTime() - Date.now();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours <= 24) return "OVERDUE" as const;
  return "PENDING" as const;
}

export default async function AdminFixturesPage({
  searchParams,
}: AdminFixturesPageProps) {
  await requireAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeLeagueParam = getSearchParamValue(resolvedSearchParams.leagueId);
  const currentLeagueIds = await getCurrentLeagueIds(activeLeagueParam);
  const currentLeagueWhere = { id: { in: currentLeagueIds } };

  const [leagues, divisions, teams, seasonTeamLinks, venues, referees, fixtures] =
    await Promise.all([
      prisma.league.findMany({
        where: currentLeagueWhere,
        orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
        select: { id: true, name: true, season: true, slug: true },
      }),
      prisma.leagueDivision.findMany({
        where: { leagueId: { in: currentLeagueIds }, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, leagueId: true, name: true },
      }),
      prisma.team.findMany({
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          leagueId: true,
          league: { select: { id: true, name: true, season: true } },
        },
      }),
      currentLeagueIds.length > 0
        ? prisma.$queryRaw<SeasonTeamLink[]>(Prisma.sql`
            SELECT "leagueId", "teamId"
            FROM "LeagueSeasonTeam"
            WHERE "isActive" = true
              AND "leagueId" IN (${Prisma.join(currentLeagueIds)})
          `)
        : Promise.resolve([] as SeasonTeamLink[]),
      prisma.venue.findMany({
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.user.findMany({
        where: { role: "REFEREE" },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { id: true, name: true, email: true },
      }),
      prisma.fixture.findMany({
        where: { leagueId: { in: currentLeagueIds } },
        orderBy: [{ kickoffAt: "asc" }, { round: "asc" }, { position: "asc" }],
        select: {
          id: true,
          leagueId: true,
          divisionId: true,
          homeTeamId: true,
          awayTeamId: true,
          venueId: true,
          refereeId: true,
          round: true,
          position: true,
          pitch: true,
          status: true,
          kickoffAt: true,
          publishedAt: true,
          matchFeePence: true,
          socialPostType: true,
          socialPostStatus: true,
          socialNeedsApproval: true,
          socialCaption: true,
          socialImageUrl: true,
          socialQueuedAt: true,
          socialApprovedAt: true,
          socialPublishedAt: true,
          venue: { select: { id: true, name: true } },
          referee: { select: { id: true, name: true, email: true } },
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
          paymentCharges: {
            select: { teamId: true, amountPence: true, status: true },
          },
          result: {
            select: { homeScore: true, awayScore: true, isDisputed: true },
          },
          captainConfirmations: {
            select: {
              teamId: true,
              status: true,
              note: true,
              confirmedAt: true,
              issueRaisedAt: true,
              lastChasedAt: true,
            },
          },
        },
      }),
    ]);

  const leagueById = new Map(leagues.map((league) => [league.id, league]));
  const seasonLeagueIdByTeam = new Map<string, string>();
  for (const link of seasonTeamLinks) {
    if (!seasonLeagueIdByTeam.has(link.teamId)) {
      seasonLeagueIdByTeam.set(link.teamId, link.leagueId);
    }
  }

  const fixturePickerTeams = teams.map((team) => {
    const effectiveLeagueId =
      team.leagueId ?? seasonLeagueIdByTeam.get(team.id) ?? null;
    const effectiveLeague =
      team.league ?? (effectiveLeagueId ? leagueById.get(effectiveLeagueId) ?? null : null);

    return {
      ...team,
      leagueId: effectiveLeagueId,
      league: effectiveLeague
        ? {
            id: effectiveLeague.id,
            name: effectiveLeague.name,
            season: effectiveLeague.season,
          }
        : null,
    };
  });

  const placeholderTeamIds = await getFixturePlaceholderTeamIds(
    teams.map((team) => team.id),
  );

  const activeLeagueId = leagues.some((league) => league.id === activeLeagueParam)
    ? activeLeagueParam ?? ""
    : leagues[0]?.id ?? "";

  const leagueDivisions = divisions.filter(
    (division) => division.leagueId === activeLeagueId,
  );
  const divisionParam = getSearchParamValue(resolvedSearchParams.divisionId);
  const activeDivisionId =
    divisionParam &&
    leagueDivisions.some((division) => division.id === divisionParam)
      ? divisionParam
      : null;
  const activeDivisionLabel =
    leagueDivisions.find((division) => division.id === activeDivisionId)?.name ??
    "All divisions";
  const activeVisibility = parseFixtureVisibility(
    getSearchParamValue(resolvedSearchParams.visibility),
  );

  const matchesSelectedLeagueDivision = (fixture: {
    leagueId: string | null;
    divisionId: string | null;
  }) => {
    if (fixture.leagueId !== activeLeagueId) return false;
    if (activeDivisionId && fixture.divisionId !== activeDivisionId) return false;
    return true;
  };

  const matchesSelectedVisibility = (fixture: { publishedAt: Date | null }) => {
    if (activeVisibility === "published") return Boolean(fixture.publishedAt);
    if (activeVisibility === "draft") return !fixture.publishedAt;
    return true;
  };

  const selectedFixtures = fixtures.filter(
    (fixture) =>
      matchesSelectedLeagueDivision(fixture) &&
      matchesSelectedVisibility(fixture),
  );

  const sortedFixtures = [...selectedFixtures].sort((a, b) => {
    if (a.round !== b.round) {
      if (a.round === null) return 1;
      if (b.round === null) return -1;
      return b.round - a.round;
    }

    const rankDifference = getFixtureDisplayRank(a) - getFixtureDisplayRank(b);
    if (rankDifference !== 0) return rankDifference;
    const dateDifference = a.kickoffAt.getTime() - b.kickoffAt.getTime();
    if (dateDifference !== 0) return dateDifference;
    return (a.position ?? 0) - (b.position ?? 0);
  });

  const publishSummary = leagues
    .filter((league) => league.id === activeLeagueId)
    .map((league) => {
      const leagueFixtures = fixtures.filter(matchesSelectedLeagueDivision);
      const draftFixtures = leagueFixtures.filter(
        (fixture) => fixture.publishedAt === null,
      );
      const draftRounds = Array.from(
        new Set(
          draftFixtures
            .map((fixture) => fixture.round)
            .filter((round): round is number => typeof round === "number"),
        ),
      ).sort((a, b) => a - b);
      const drafts = draftFixtures.length;
      const published = leagueFixtures.length - drafts;
      const scheduled = leagueFixtures.filter(
        (fixture) => fixture.status === "SCHEDULED",
      ).length;
      return {
        league,
        total: leagueFixtures.length,
        drafts,
        published,
        scheduled,
        draftRounds,
      };
    });

  const publishNotice = buildPublishNotice({
    searchParams: resolvedSearchParams,
    leagues: leagues.map((league) => ({ id: league.id, name: league.name })),
  });
  const chaseNotice = buildChaseNotice(resolvedSearchParams);
  const emailReplyConfigured = Boolean(process.env.EMAIL_REPLY_DOMAIN?.trim());

  const screenData = {
    leagues,
    teams: fixturePickerTeams,
    venues,
    referees,
    initialLeagueId: activeLeagueId,
    fixtures: sortedFixtures.map((fixture) => {
      const containsPlaceholder =
        placeholderTeamIds.has(fixture.homeTeamId) ||
        placeholderTeamIds.has(fixture.awayTeamId);
      const homeConfirmation =
        fixture.captainConfirmations.find(
          (item) => item.teamId === fixture.homeTeamId,
        ) ?? null;
      const awayConfirmation =
        fixture.captainConfirmations.find(
          (item) => item.teamId === fixture.awayTeamId,
        ) ?? null;
      const activeCharges = fixture.paymentCharges.filter(
        (charge) => charge.status !== "VOID",
      );
      const homeCharge = activeCharges.find(
        (charge) => charge.teamId === fixture.homeTeamId,
      );
      const awayCharge = activeCharges.find(
        (charge) => charge.teamId === fixture.awayTeamId,
      );
      const legacyFee = fixture.matchFeePence ?? null;
      const homeMatchFeePence = containsPlaceholder
        ? null
        : homeCharge?.amountPence ?? (legacyFee && !awayCharge ? legacyFee : null);
      const awayMatchFeePence = containsPlaceholder
        ? null
        : awayCharge?.amountPence ?? (legacyFee && !homeCharge ? legacyFee : null);
      const homeConfirmationStatus = containsPlaceholder
        ? null
        : homeConfirmation?.status ??
          (fixture.status === "SCHEDULED" && fixture.kickoffAt > new Date()
            ? getFallbackConfirmationStatus(fixture.kickoffAt)
            : null);
      const awayConfirmationStatus = containsPlaceholder
        ? null
        : awayConfirmation?.status ??
          (fixture.status === "SCHEDULED" && fixture.kickoffAt > new Date()
            ? getFallbackConfirmationStatus(fixture.kickoffAt)
            : null);

      return {
        id: fixture.id,
        leagueId: fixture.leagueId,
        homeTeamId: fixture.homeTeamId,
        awayTeamId: fixture.awayTeamId,
        venueId: fixture.venueId,
        refereeId: fixture.refereeId,
        homeTeamName: fixture.homeTeam?.name ?? "Unknown team 1",
        awayTeamName: fixture.awayTeam?.name ?? "Unknown team 2",
        venueName: fixture.venue?.name ?? null,
        refereeName: fixture.referee?.name ?? fixture.referee?.email ?? null,
        kickoffLabel: formatKickoffLabel(fixture.kickoffAt),
        kickoffAtIso: fixture.kickoffAt
          ? fixture.kickoffAt.toISOString()
          : null,
        publishedAtIso: fixture.publishedAt
          ? fixture.publishedAt.toISOString()
          : null,
        round: fixture.round,
        position: fixture.position,
        pitch: fixture.pitch,
        status: fixture.status,
        matchFeePence: containsPlaceholder ? null : fixture.matchFeePence,
        homeMatchFeePence,
        awayMatchFeePence,
        homeScore: fixture.result?.homeScore ?? null,
        awayScore: fixture.result?.awayScore ?? null,
        resultIsDisputed: fixture.result?.isDisputed ?? false,
        socialPostType: fixture.socialPostType,
        socialPostStatus: fixture.socialPostStatus,
        socialNeedsApproval: fixture.socialNeedsApproval,
        socialCaption: fixture.socialCaption,
        socialImageUrl: fixture.socialImageUrl,
        socialQueuedAtIso: fixture.socialQueuedAt?.toISOString() ?? null,
        socialApprovedAtIso: fixture.socialApprovedAt?.toISOString() ?? null,
        socialPublishedAtIso: fixture.socialPublishedAt?.toISOString() ?? null,
        homeConfirmationStatus: homeConfirmationStatus as
          | FixtureCaptainConfirmationStatus
          | "OVERDUE"
          | null,
        homeConfirmationNote: homeConfirmation?.note ?? null,
        homeConfirmedAtIso: homeConfirmation?.confirmedAt?.toISOString() ?? null,
        homeIssueRaisedAtIso:
          homeConfirmation?.issueRaisedAt?.toISOString() ?? null,
        homeLastChasedAtIso:
          homeConfirmation?.lastChasedAt?.toISOString() ?? null,
        awayConfirmationStatus: awayConfirmationStatus as
          | FixtureCaptainConfirmationStatus
          | "OVERDUE"
          | null,
        awayConfirmationNote: awayConfirmation?.note ?? null,
        awayConfirmedAtIso: awayConfirmation?.confirmedAt?.toISOString() ?? null,
        awayIssueRaisedAtIso:
          awayConfirmation?.issueRaisedAt?.toISOString() ?? null,
        awayLastChasedAtIso:
          awayConfirmation?.lastChasedAt?.toISOString() ?? null,
      };
    }),
  };

  const selectedScopeLabel = `${activeDivisionLabel} · ${formatVisibility(
    activeVisibility,
  )}`;

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <FixtureMatchupGrid
        initialLeagueId={activeLeagueId}
        initialDivisionId={activeDivisionId ?? undefined}
      />

      <AdminCard className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="border-b border-white/10 px-6 py-6 md:px-8">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Publish &amp; notify
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Send fixtures to teams
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-white/60">
              Showing {selectedScopeLabel}. Publishing is locked to the selected
              league and division.
            </p>
          </div>
        </div>

        {!emailReplyConfigured ? (
          <div className="px-6 pt-6 md:px-8">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Reply-by-email is not configured yet. Add{" "}
              <span className="font-mono">EMAIL_REPLY_DOMAIN</span> in the deployed
              environment before publishing fixtures because this flow emails
              teams and queues reminder emails.
            </div>
          </div>
        ) : null}

        {publishNotice ? (
          <div className="px-6 pt-6 md:px-8">
            <div
              className={[
                "rounded-2xl border px-4 py-3 text-sm",
                publishNotice.tone === "success"
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  : publishNotice.tone === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-100"
                    : "border-white/10 bg-white/[0.05] text-white/75",
              ].join(" ")}
            >
              {publishNotice.message}
            </div>
          </div>
        ) : null}

        {chaseNotice ? (
          <div className="px-6 pt-6 md:px-8">
            <div
              className={[
                "rounded-2xl border px-4 py-3 text-sm",
                chaseNotice.tone === "success"
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  : chaseNotice.tone === "error"
                    ? "border-red-500/30 bg-red-500/10 text-red-100"
                    : "border-white/10 bg-white/[0.05] text-white/75",
              ].join(" ")}
            >
              {chaseNotice.message}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 md:px-8 xl:grid-cols-3">
          {publishSummary.map((item) => {
            const publishDisabled = item.drafts === 0 || !emailReplyConfigured;
            const weekPublishDisabled =
              item.drafts === 0 ||
              item.draftRounds.length === 0 ||
              !emailReplyConfigured;
            const defaultRound = item.draftRounds[0] ?? 1;
            const publishLabel =
              item.drafts === 0
                ? "No draft fixtures to publish"
                : !emailReplyConfigured
                  ? "Configure reply email before publishing"
                  : `Publish all ${formatCount(item.drafts, "draft fixture")}`;
            const weekLabel =
              item.draftRounds.length > 0
                ? `Draft weeks: ${item.draftRounds.join(", ")}`
                : "No draft weeks detected";

            return (
              <div
                key={item.league.id}
                className="rounded-3xl border border-emerald-400/30 bg-black/30 p-5 shadow-[0_0_0_1px_rgba(16,185,129,0.12)] transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-white">
                      {item.league.name}
                    </div>
                    <div className="mt-1 text-sm text-white/45">
                      {selectedScopeLabel}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                      Selected
                    </span>
                    <Link
                      href={`/leagues/${item.league.slug}`}
                      target="_blank"
                      className="inline-flex rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      Public
                    </Link>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Total
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {item.total}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Draft
                    </div>
                    <div className="mt-1 text-lg font-semibold text-amber-300">
                      {item.drafts}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Published
                    </div>
                    <div className="mt-1 text-lg font-semibold text-emerald-300">
                      {item.published}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                      Scheduled
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {item.scheduled}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <form
                    action={publishAndEmailLeagueFixtureWeekAction}
                    className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4"
                  >
                    <input type="hidden" name="leagueId" value={item.league.id} />
                    {activeDivisionId ? (
                      <input
                        type="hidden"
                        name="divisionId"
                        value={activeDivisionId}
                      />
                    ) : null}
                    <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white">
                      Publishing: {activeDivisionLabel}
                    </div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
                      Publish one week only
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="number"
                        name="round"
                        min={1}
                        defaultValue={defaultRound}
                        disabled={weekPublishDisabled}
                        className="h-12 w-28 rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <button
                        type="submit"
                        disabled={weekPublishDisabled}
                        className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Publish week
                      </button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-emerald-50/70">
                      {weekLabel}. Only fixtures from the selected league/division
                      and chosen week are made live and emailed.
                    </p>
                  </form>

                  <form
                    action={publishAndEmailLeagueFixturesAction}
                    className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4"
                  >
                    <input type="hidden" name="leagueId" value={item.league.id} />
                    {activeDivisionId ? (
                      <input
                        type="hidden"
                        name="divisionId"
                        value={activeDivisionId}
                      />
                    ) : null}
                    <div className="mb-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white">
                      Publishing: {activeDivisionLabel}
                    </div>
                    <p className="mb-3 text-xs leading-5 text-amber-100/80">
                      Use this only when you want every remaining draft fixture for
                      this selected league/division to go live and email teams.
                    </p>
                    <button
                      type="submit"
                      disabled={publishDisabled}
                      className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {publishLabel}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {publishSummary.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-white/55 md:col-span-2 xl:col-span-3">
              No current league season is selected for fixture publishing.
            </div>
          ) : null}
        </div>
      </AdminCard>

      <div className="[&>div>div:first-child]:hidden">
        <FixturesAdminScreen {...screenData} />
      </div>
    </div>
  );
}
