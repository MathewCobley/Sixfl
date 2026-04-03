// ========================================
// File: src/app/(admin)/admin/page.tsx
// ========================================

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";
import { getAdminInboxSummary } from "@/lib/messaging/service";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(value);
}

function formatLeadType(value: string) {
  switch (value) {
    case "TEAM":
      return "Team";
    case "PLAYER":
      return "Player";
    case "REFEREE":
      return "Referee";
    default:
      return value;
  }
}

function previewText(value: string | null | undefined, max = 120) {
  if (!value) return "No recent activity yet.";

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3)}...`;
}

function MetricCard({
  href,
  label,
  value,
  helper,
}: {
  href: string;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5 transition hover:border-emerald-400/20 hover:bg-white/[0.05]"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      <div className="mt-2 text-sm leading-6 text-white/55">{helper}</div>
    </Link>
  );
}

function AttentionCard({
  href,
  label,
  value,
  description,
}: {
  href: string;
  label: string;
  value: number;
  description: string;
}) {
  const hasAttention = value > 0;

  return (
    <Link
      href={href}
      className={[
        "rounded-2xl border p-4 transition",
        hasAttention
          ? "border-emerald-400/20 bg-emerald-400/8 hover:bg-emerald-400/12"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{label}</div>
          <div className="mt-2 text-sm leading-6 text-white/55">
            {description}
          </div>
        </div>

        <div
          className={[
            "inline-flex min-w-[3rem] items-center justify-center rounded-2xl px-3 py-2 text-lg font-semibold",
            hasAttention
              ? "bg-emerald-400/15 text-emerald-200"
              : "bg-white/[0.05] text-white/65",
          ].join(" ")}
        >
          {value}
        </div>
      </div>
    </Link>
  );
}

export default async function AdminHome() {
  await requireAdmin();

  const now = new Date();

  const [
    activeLeaguesCount,
    teamsInLeaguesCount,
    newLeadsCount,
    upcomingFixturesCount,
    teamsNeedingContactCleanupCount,
    fixturesWithoutRefereeCount,
    disputedResultsCount,
    inboxSummary,
    upcomingFixtures,
    latestLeads,
    activeLeaguesSnapshot,
  ] = await Promise.all([
    prisma.league.count({
      where: {
        isActive: true,
      },
    }),
    prisma.team.count({
      where: {
        leagueId: {
          not: null,
        },
      },
    }),
    prisma.interestLead.count({
      where: {
        status: "NEW",
      },
    }),
    prisma.fixture.count({
      where: {
        status: "SCHEDULED",
        kickoffAt: {
          gte: now,
        },
      },
    }),
    prisma.team.count({
      where: {
        OR: [
          { contactEmail: null },
          { contactEmail: "" },
          { contactPhone: null },
          { contactPhone: "" },
        ],
      },
    }),
    prisma.fixture.count({
      where: {
        status: "SCHEDULED",
        kickoffAt: {
          gte: now,
        },
        refereeId: null,
      },
    }),
    prisma.matchResult.count({
      where: {
        isDisputed: true,
      },
    }),
    getAdminInboxSummary(),
    prisma.fixture.findMany({
      where: {
        status: "SCHEDULED",
        kickoffAt: {
          gte: now,
        },
      },
      orderBy: {
        kickoffAt: "asc",
      },
      take: 6,
      select: {
        id: true,
        kickoffAt: true,
        pitch: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            slug: true,
          },
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
          },
        },
        venue: {
          select: {
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
      },
    }),
    prisma.interestLead.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      select: {
        id: true,
        contactName: true,
        interestType: true,
        area: true,
        status: true,
        teamName: true,
        createdAt: true,
      },
    }),
    prisma.league.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
      take: 6,
      select: {
        id: true,
        name: true,
        season: true,
        slug: true,
        _count: {
          select: {
            teams: true,
            fixtures: true,
          },
        },
      },
    }),
  ]);

  const latestInboundName =
    inboxSummary.latestInbound?.thread.team?.name ||
    inboxSummary.latestInbound?.thread.recipient?.displayName ||
    "No replies yet";

  return (
    <div className="w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_34%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Live operations
              </div>

              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Admin overview
                </h1>
                <p className="mt-3 text-sm leading-6 text-white/60 md:text-base">
                  A proper day-to-day dashboard for unread messages, fresh
                  leads, upcoming fixtures and operational issues that need
                  attention.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/messages?filter=unread"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Open inbox
              </Link>

              <Link
                href="/admin/leads"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                View leads
              </Link>

              <Link
                href="/admin/fixtures"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Fixtures console
              </Link>

              <Link
                href="/admin/leagues/new"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Create league
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            href="/admin/leagues"
            label="Active leagues"
            value={activeLeaguesCount}
            helper="Live leagues currently available on the platform."
          />
          <MetricCard
            href="/admin/teams"
            label="Teams in leagues"
            value={teamsInLeaguesCount}
            helper={`${teamsNeedingContactCleanupCount} teams still need contact cleanup.`}
          />
          <MetricCard
            href="/admin/leads"
            label="New leads"
            value={newLeadsCount}
            helper="Fresh team, player and referee enquiries waiting for follow-up."
          />
          <MetricCard
            href="/admin/fixtures"
            label="Upcoming fixtures"
            value={upcomingFixturesCount}
            helper="All scheduled matches still to come."
          />
        </div>

        <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <AdminCard title="Next fixtures">
              {upcomingFixtures.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
                  No upcoming fixtures yet. Once matches are scheduled, the next
                  set will appear here.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingFixtures.map((fixture) => {
                    const refereeLabel =
                      fixture.referee?.name ||
                      fixture.referee?.email ||
                      "Unassigned referee";

                    return (
                      <div
                        key={fixture.id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                              {fixture.league.season
                                ? `${fixture.league.name} · ${fixture.league.season}`
                                : fixture.league.name}
                            </div>

                            <div className="mt-2 text-base font-semibold text-white">
                              {fixture.homeTeam.name} v {fixture.awayTeam.name}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/45">
                              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                                {formatDateTime(fixture.kickoffAt)}
                              </span>

                              {fixture.venue?.name ? (
                                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                                  {fixture.venue.name}
                                </span>
                              ) : null}

                              {fixture.pitch ? (
                                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                                  Pitch {fixture.pitch}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-col items-start gap-2 xl:items-end">
                            <span
                              className={[
                                "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                                fixture.referee
                                  ? "border border-white/10 bg-white/[0.04] text-white/70"
                                  : "border border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
                              ].join(" ")}
                            >
                              {refereeLabel}
                            </span>

                            <Link
                              href="/admin/fixtures"
                              className="text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
                            >
                              Open fixtures →
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AdminCard>

            <AdminCard title="Latest leads">
              {latestLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
                  No recent leads yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {latestLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      href="/admin/leads"
                      className="block rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-black/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                              {formatLeadType(lead.interestType)}
                            </span>

                            <span className="text-xs text-white/40">
                              {formatShortDate(lead.createdAt)}
                            </span>
                          </div>

                          <div className="mt-2 text-sm font-semibold text-white">
                            {lead.contactName}
                          </div>

                          <div className="mt-1 text-sm text-white/55">
                            {lead.teamName || lead.area || "General enquiry"}
                          </div>
                        </div>

                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                          {lead.status}
                        </span>
                      </div>
                    </Link>
                  ))}

                  <div className="pt-2">
                    <Link
                      href="/admin/leads"
                      className="text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
                    >
                      Open leads →
                    </Link>
                  </div>
                </div>
              )}
            </AdminCard>
          </div>

          <div className="space-y-6">
            <AdminCard title="Needs attention">
              <div className="grid gap-3 sm:grid-cols-2">
                <AttentionCard
                  href="/admin/messages?filter=unread"
                  label="Unread inbox"
                  value={inboxSummary.unreadThreads}
                  description="SMS conversations still waiting for review."
                />
                <AttentionCard
                  href="/admin/fixtures"
                  label="No referee"
                  value={fixturesWithoutRefereeCount}
                  description="Upcoming fixtures missing a referee."
                />
                <AttentionCard
                  href="/admin/fixtures"
                  label="Disputed results"
                  value={disputedResultsCount}
                  description="Completed matches that need checking."
                />
                <AttentionCard
                  href="/admin/teams"
                  label="Contact cleanup"
                  value={teamsNeedingContactCleanupCount}
                  description="Teams with incomplete primary contact details."
                />
              </div>
            </AdminCard>

            <AdminCard title="Inbox pulse">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                    {inboxSummary.unreadThreads} unread threads
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                    {inboxSummary.unreadMessages} unread messages
                  </span>
                </div>

                <div className="mt-4 text-lg font-semibold text-white">
                  {latestInboundName}
                </div>

                <div className="mt-2 text-sm leading-6 text-white/60">
                  {previewText(inboxSummary.latestInbound?.body)}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-white/40">
                  <span>
                    {inboxSummary.latestInbound?.createdAt
                      ? formatDateTime(inboxSummary.latestInbound.createdAt)
                      : "No inbound messages yet"}
                  </span>

                  <Link
                    href="/admin/messages?filter=unread"
                    className="font-semibold text-emerald-300 transition hover:text-emerald-200"
                  >
                    Open inbox →
                  </Link>
                </div>
              </div>
            </AdminCard>

            <AdminCard title="Active leagues snapshot">
              {activeLeaguesSnapshot.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
                  No active leagues yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeLeaguesSnapshot.map((league) => (
                    <Link
                      key={league.id}
                      href={`/admin/leagues/${league.id}`}
                      className="block rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-black/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {league.name}
                          </div>
                          <div className="mt-1 text-sm text-white/50">
                            {league.season || "No season set"}
                          </div>
                        </div>

                        <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/65">
                            {league._count.teams} teams
                          </span>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/65">
                            {league._count.fixtures} fixtures
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}

                  <div className="pt-2">
                    <Link
                      href="/admin/leagues"
                      className="text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
                    >
                      Open leagues →
                    </Link>
                  </div>
                </div>
              )}
            </AdminCard>
          </div>
        </div>
      </div>
    </div>
  );
}
