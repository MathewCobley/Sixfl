// ========================================
// File: src/app/(admin)/admin/fixtures/kickoff-restrictions/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { getCurrentLeagueOptions } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  addWeeks,
  formatWeekLabel,
  getCurrentWeekStart,
  listUpcomingTeamWeekUnavailability,
} from "@/lib/team-week-unavailability";
import { getFixturePlaceholderTeamIds } from "@/lib/teams/fixture-placeholders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  leagueId?: string;
}>;

type TeamKickoffRestrictionRow = {
  id: string;
  name: string;
  divisionName: string | null;
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
};

function cleanTime(value: string | null) {
  const time = value?.trim() ?? "";
  return /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : time || null;
}

function getWindowLabel(input: {
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
}) {
  const earliest = cleanTime(input.earliestKickoffTime);
  const latest = cleanTime(input.latestKickoffTime);

  if (earliest && latest) return `${earliest}–${latest}`;
  if (earliest) return `From ${earliest}`;
  if (latest) return `By ${latest}`;
  return "Any KO time";
}

function isRestricted(input: {
  earliestKickoffTime: string | null;
  latestKickoffTime: string | null;
}) {
  return Boolean(cleanTime(input.earliestKickoffTime) || cleanTime(input.latestKickoffTime));
}

async function getLeagueTeams(leagueId: string) {
  const rows = await prisma.$queryRaw<TeamKickoffRestrictionRow[]>(Prisma.sql`
    WITH membership_state AS (
      SELECT EXISTS (
        SELECT 1
        FROM "LeagueSeasonTeam" active_membership
        WHERE active_membership."leagueId" = ${leagueId}
          AND active_membership."isActive" = TRUE
      ) AS "hasActiveMemberships"
    )
    SELECT DISTINCT
      team."id",
      team."name",
      division."name" AS "divisionName",
      team."earliestKickoffTime",
      team."latestKickoffTime"
    FROM "Team" team
    LEFT JOIN "LeagueSeasonTeam" membership
      ON membership."teamId" = team."id"
      AND membership."leagueId" = ${leagueId}
      AND membership."isActive" = TRUE
    LEFT JOIN "LeagueDivision" division
      ON division."id" = team."divisionId"
    CROSS JOIN membership_state
    WHERE (
      (membership_state."hasActiveMemberships" = TRUE AND membership."teamId" IS NOT NULL)
      OR
      (membership_state."hasActiveMemberships" = FALSE AND team."leagueId" = ${leagueId})
    )
    ORDER BY team."name" ASC
  `);

  const placeholderTeamIds = await getFixturePlaceholderTeamIds(rows.map((row) => row.id));
  return rows.filter((row) => !placeholderTeamIds.has(row.id));
}

export default async function KickoffRestrictionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();

  const resolvedSearchParams = await searchParams;
  const requestedLeagueId = resolvedSearchParams.leagueId?.trim() || null;
  const leagues = await getCurrentLeagueOptions(requestedLeagueId);
  const activeLeagueId = leagues.some((league) => league.id === requestedLeagueId)
    ? requestedLeagueId ?? ""
    : leagues[0]?.id ?? "";
  const activeLeague = leagues.find((league) => league.id === activeLeagueId) ?? null;

  const teamRows = activeLeagueId ? await getLeagueTeams(activeLeagueId) : [];
  const sortedTeams = [...teamRows].sort((a, b) => {
    const restrictionDifference = Number(isRestricted(b)) - Number(isRestricted(a));
    if (restrictionDifference !== 0) return restrictionDifference;
    return a.name.localeCompare(b.name);
  });
  const teamIds = new Set(teamRows.map((team) => team.id));
  const permanentRestrictionCount = teamRows.filter(isRestricted).length;

  const from = getCurrentWeekStart();
  const to = addWeeks(from, 20);
  const upcomingNotices = activeLeagueId
    ? await listUpcomingTeamWeekUnavailability({ from, to })
    : [];
  const temporaryRestrictions = upcomingNotices.filter(
    (notice) =>
      teamIds.has(notice.teamId) &&
      notice.restrictionType === "TIME_RESTRICTION" &&
      Boolean(cleanTime(notice.earliestKickoff) || cleanTime(notice.latestKickoff)),
  );

  const temporaryByWeek = new Map<string, typeof temporaryRestrictions>();
  for (const restriction of temporaryRestrictions) {
    const key = restriction.weekStart.toISOString().slice(0, 10);
    const existing = temporaryByWeek.get(key) ?? [];
    existing.push(restriction);
    temporaryByWeek.set(key, existing);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),rgba(255,255,255,0.03)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Fixture planning
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              KO time restrictions
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Quick reference for manual fixture building. Permanent team KO windows are shown first, followed by any temporary week-specific time restrictions.
            </p>
          </div>

          <form method="get" className="flex w-full max-w-md flex-col gap-2 sm:flex-row lg:w-auto">
            <label className="sr-only" htmlFor="leagueId">League</label>
            <select
              id="leagueId"
              name="leagueId"
              defaultValue={activeLeagueId}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 text-sm font-semibold text-white outline-none focus:border-emerald-400/40"
            >
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}{league.season ? ` — ${league.season}` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="min-h-11 rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
            >
              View league
            </button>
          </form>
        </div>
      </section>

      {activeLeague ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-white/35">League teams</div>
              <div className="mt-2 text-3xl font-semibold text-white">{teamRows.length}</div>
              <div className="mt-1 text-sm text-white/45">{activeLeague.name}</div>
            </AdminCard>
            <AdminCard className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-amber-100/55">Permanent KO rules</div>
              <div className="mt-2 text-3xl font-semibold text-white">{permanentRestrictionCount}</div>
              <div className="mt-1 text-sm text-amber-100/60">Team-level windows</div>
            </AdminCard>
            <AdminCard className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-sky-100/55">Temporary KO rules</div>
              <div className="mt-2 text-3xl font-semibold text-white">{temporaryRestrictions.length}</div>
              <div className="mt-1 text-sm text-sky-100/60">Next 20 weeks</div>
            </AdminCard>
          </div>

          <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-end sm:justify-between md:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Permanent restrictions</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Team KO windows</h2>
              </div>
              <p className="text-sm text-white/45">Restricted teams are listed first.</p>
            </div>

            {sortedTeams.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-white/50">No teams are assigned to this league.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="border-b border-white/10 bg-black/20 text-[11px] uppercase tracking-[0.16em] text-white/35">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Team</th>
                      <th className="px-5 py-3 font-semibold">Earliest KO</th>
                      <th className="px-5 py-3 font-semibold">Latest KO</th>
                      <th className="px-5 py-3 font-semibold">Allowed window</th>
                      <th className="px-5 py-3 text-right font-semibold">Team</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {sortedTeams.map((team) => {
                      const restricted = isRestricted(team);
                      return (
                        <tr key={team.id} className={restricted ? "bg-amber-500/[0.045]" : ""}>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-white">{team.name}</div>
                            {team.divisionName ? <div className="mt-1 text-xs text-white/35">{team.divisionName}</div> : null}
                          </td>
                          <td className="px-5 py-4 font-mono text-white/70">{cleanTime(team.earliestKickoffTime) ?? "—"}</td>
                          <td className="px-5 py-4 font-mono text-white/70">{cleanTime(team.latestKickoffTime) ?? "—"}</td>
                          <td className="px-5 py-4">
                            <span className={restricted
                              ? "inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 font-semibold text-amber-100"
                              : "inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-white/45"}
                            >
                              {getWindowLabel(team)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link
                              href={`/admin/teams/${team.id}`}
                              className="inline-flex min-h-9 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/65 transition hover:border-emerald-400/25 hover:text-emerald-100"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/55">Temporary restrictions</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Week-specific KO windows</h2>
              </div>
              <p className="text-sm text-white/45">Current week + next 19 weeks</p>
            </div>

            {temporaryRestrictions.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/50">
                No temporary KO time restrictions are recorded for this league in the next 20 weeks.
              </div>
            ) : (
              Array.from(temporaryByWeek.entries()).map(([weekKey, restrictions]) => (
                <div key={weekKey} className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.04] p-5 md:p-6">
                  <div className="border-b border-white/10 pb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">Week commencing {weekKey.split("-").reverse().join("/")}</p>
                    <h3 className="mt-2 text-lg font-semibold text-white">{formatWeekLabel(restrictions[0].weekStart)}</h3>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {restrictions.map((restriction) => (
                      <article key={restriction.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="font-semibold text-white">{restriction.teamName}</h4>
                            {restriction.divisionName ? <p className="mt-1 text-xs text-white/35">{restriction.divisionName}</p> : null}
                          </div>
                          <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1.5 text-sm font-semibold text-sky-100">
                            {getWindowLabel({
                              earliestKickoffTime: restriction.earliestKickoff,
                              latestKickoffTime: restriction.latestKickoff,
                            })}
                          </span>
                        </div>
                        {restriction.note ? (
                          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white/65">{restriction.note}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/admin/fixtures?leagueId=${encodeURIComponent(activeLeagueId)}`}
              className="inline-flex min-h-11 items-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Back to fixtures for this league
            </Link>
            <Link
              href="/admin/team-unavailability"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/65 transition hover:bg-white/[0.08] hover:text-white"
            >
              View teams unavailable
            </Link>
          </div>
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-12 text-center">
          <h2 className="text-xl font-semibold text-white">No current league available</h2>
          <p className="mt-2 text-sm text-white/50">Create or activate a league before using the KO restriction planner.</p>
        </div>
      )}
    </div>
  );
}
