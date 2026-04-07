// ========================================
// File: src/app/(admin)/admin/fixtures/page.tsx
// ========================================

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";
import FixturesAdminScreen from "@/components/admin/fixtures/FixturesAdminScreen";
import { publishAndEmailLeagueFixturesAction } from "@/app/(admin)/admin/fixtures/publish-actions";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type AdminFixturesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PublishNotice = {
  tone: "success" | "info" | "error";
  message: string;
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

function formatCount(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function buildPublishNotice(input: {
  searchParams: Record<string, string | string[] | undefined>;
  leagues: Array<{ id: string; name: string }>;
}): PublishNotice | null {
  const publish = getSearchParamValue(input.searchParams.publish);
  if (!publish) return null;

  const leagueId = getSearchParamValue(input.searchParams.leagueId);
  const leagueName =
    input.leagues.find((league) => league.id === leagueId)?.name ?? "this league";

  const published = Number(getSearchParamValue(input.searchParams.published) ?? 0);
  const digestQueued = Number(
    getSearchParamValue(input.searchParams.digestQueued) ?? 0,
  );
  const digestSkipped = Number(
    getSearchParamValue(input.searchParams.digestSkipped) ?? 0,
  );
  const reminderQueued = Number(
    getSearchParamValue(input.searchParams.reminderQueued) ?? 0,
  );
  const reminderSkipped = Number(
    getSearchParamValue(input.searchParams.reminderSkipped) ?? 0,
  );
  const publishError = getSearchParamValue(input.searchParams.publishError);

  if (publish === "success") {
    const summaryParts = [
      `${formatCount(published, "fixture")} published for ${leagueName}`,
      `${formatCount(digestQueued, "digest email")} queued`,
      `${formatCount(reminderQueued, "reminder email")} queued`,
    ];

    const skipped = digestSkipped + reminderSkipped;
    if (skipped > 0) {
      summaryParts.push(
        `${formatCount(skipped, "notification")} skipped because team email details were missing or disabled`,
      );
    }

    return {
      tone: "success",
      message: `${summaryParts.join(". ")}.`,
    };
  }

  if (publish === "none") {
    return {
      tone: "info",
      message: `No draft fixtures were waiting to be published for ${leagueName}.`,
    };
  }

  if (publish === "error" && publishError === "reply_not_configured") {
    return {
      tone: "error",
      message: `Reply-by-email is not configured yet. Add EMAIL_REPLY_DOMAIN in the deployed environment before publishing fixtures for ${leagueName}.`,
    };
  }

  if (publish === "error") {
    return {
      tone: "error",
      message: `Publishing fixtures for ${leagueName} could not be completed.`,
    };
  }

  return null;
}

export default async function AdminFixturesPage({
  searchParams,
}: AdminFixturesPageProps) {
  await requireAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const [leagues, teams, venues, referees, fixtures] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        season: true,
        slug: true,
      },
    }),

    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
          },
        },
      },
    }),

    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),

    prisma.user.findMany({
      where: {
        role: "REFEREE",
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),

    prisma.fixture.findMany({
      orderBy: [{ kickoffAt: "asc" }, { round: "asc" }, { position: "asc" }],
      select: {
        id: true,
        leagueId: true,
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
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
        referee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        homeTeam: {
          select: {
            name: true,
          },
        },
        awayTeam: {
          select: {
            name: true,
          },
        },
        result: {
          select: {
            homeScore: true,
            awayScore: true,
          },
        },
      },
    }),
  ]);

  const activeLeagueParam = getSearchParamValue(resolvedSearchParams.leagueId);
  const activeLeagueId = leagues.some((league) => league.id === activeLeagueParam)
    ? activeLeagueParam ?? ""
    : leagues[0]?.id ?? "";

  const publishSummary = leagues.map((league) => {
    const leagueFixtures = fixtures.filter((fixture) => fixture.leagueId === league.id);
    const drafts = leagueFixtures.filter((fixture) => fixture.publishedAt === null).length;
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
      isActive: league.id === activeLeagueId,
    };
  });

  const publishNotice = buildPublishNotice({
    searchParams: resolvedSearchParams,
    leagues: leagues.map((league) => ({ id: league.id, name: league.name })),
  });

  const emailReplyConfigured = Boolean(process.env.EMAIL_REPLY_DOMAIN?.trim());

  const screenData = {
    leagues,
    teams,
    venues,
    referees,
    initialLeagueId: activeLeagueId,
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      leagueId: fixture.leagueId,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      venueId: fixture.venueId,
      refereeId: fixture.refereeId,
      homeTeamName: fixture.homeTeam?.name ?? "Unknown home team",
      awayTeamName: fixture.awayTeam?.name ?? "Unknown away team",
      venueName: fixture.venue?.name ?? null,
      refereeName: fixture.referee?.name ?? fixture.referee?.email ?? null,
      kickoffLabel: formatKickoffLabel(fixture.kickoffAt),
      kickoffAtIso: fixture.kickoffAt ? fixture.kickoffAt.toISOString() : null,
      publishedAtIso: fixture.publishedAt ? fixture.publishedAt.toISOString() : null,
      round: fixture.round,
      position: fixture.position,
      pitch: fixture.pitch,
      status: fixture.status,
      homeScore: fixture.result?.homeScore ?? null,
      awayScore: fixture.result?.awayScore ?? null,
    })),
  };

  return (
    <div className="w-full space-y-8 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdminCard className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <div className="border-b border-white/10 px-6 py-6 md:px-8">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Publish & notify
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">
              Send fixtures to teams
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-white/60">
              Draft fixtures stay private until you publish them. Publishing sends the
              fixture digest to team contacts and queues reminder emails before kickoff.
            </p>
          </div>
        </div>

        {!emailReplyConfigured ? (
          <div className="px-6 pt-6 md:px-8">
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Reply-by-email is not configured yet. Add{" "}
              <span className="font-mono">EMAIL_REPLY_DOMAIN</span> in the
              deployed environment, for example{" "}
              <span className="font-mono">replies.sixfl.co.uk</span>, before
              publishing fixtures because this flow emails teams and queues reminder emails.
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

        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 md:px-8 xl:grid-cols-3">
          {publishSummary.map((item) => {
            const publishDisabled = item.drafts === 0 || !emailReplyConfigured;
            const publishLabel =
              item.drafts === 0
                ? "No draft fixtures to publish"
                : !emailReplyConfigured
                  ? "Configure reply email before publishing"
                  : `Publish ${formatCount(item.drafts, "draft fixture")} & email teams`;

            return (
              <div
                key={item.league.id}
                className={[
                  "rounded-3xl border bg-black/30 p-5 transition",
                  item.isActive
                    ? "border-emerald-400/30 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                    : "border-white/10",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-white">
                      {item.league.name}
                    </div>
                    <div className="mt-1 text-sm text-white/45">
                      {item.league.season || "No season set"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.isActive ? (
                      <span className="inline-flex rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                        Active
                      </span>
                    ) : null}
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
                    <div className="mt-1 text-lg font-semibold text-white">{item.total}</div>
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

                <div className="mt-5 space-y-3">
                  <form action={publishAndEmailLeagueFixturesAction}>
                    <input type="hidden" name="leagueId" value={item.league.id} />
                    <button
                      type="submit"
                      disabled={publishDisabled}
                      className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {publishLabel}
                    </button>
                  </form>

                  <Link
                    href={`/admin/fixtures?leagueId=${item.league.id}`}
                    className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
                  >
                    View in fixtures table
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </AdminCard>

      <FixturesAdminScreen {...screenData} />
    </div>
  );
}
