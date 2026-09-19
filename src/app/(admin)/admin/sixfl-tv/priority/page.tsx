import Link from "next/link";

import PriorityLeagueChart from "@/components/admin/sixfl-tv/PriorityLeagueChart";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  capturePriorityWeeklySnapshot,
  readPriorityWeeklyHistory,
  type PriorityWeeklySnapshotRow,
} from "@/lib/sixfl-tv/priority-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asWeek(value: string | Date) {
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function fullWeekLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function leagueName(rows: PriorityWeeklySnapshotRow[]) {
  return rows.at(-1)?.leagueName || "League";
}

export default async function SixflTvPriorityOverviewPage() {
  await requireAdmin();
  await capturePriorityWeeklySnapshot();
  const history = await readPriorityWeeklyHistory();

  const byLeague = new Map<string, PriorityWeeklySnapshotRow[]>();
  for (const row of history) {
    const rows = byLeague.get(row.leagueId) ?? [];
    rows.push(row);
    byLeague.set(row.leagueId, rows);
  }

  const leagues = [...byLeague.entries()]
    .map(([leagueId, rows]) => {
      const weeks = [...new Set(rows.map((row) => asWeek(row.weekStart)))].sort();
      const latestWeek = weeks.at(-1) || "";
      const previousWeek = weeks.at(-2) || "";
      const currentRows = rows.filter((row) => asWeek(row.weekStart) === latestWeek);
      const previousRows = previousWeek ? rows.filter((row) => asWeek(row.weekStart) === previousWeek) : [];
      const currentAverage = average(currentRows.map((row) => row.score));
      const previousAverage = previousRows.length ? average(previousRows.map((row) => row.score)) : null;
      const delta = previousAverage == null ? null : currentAverage - previousAverage;

      const teamRows = new Map<string, PriorityWeeklySnapshotRow[]>();
      for (const row of rows) {
        const list = teamRows.get(row.teamId) ?? [];
        list.push(row);
        teamRows.set(row.teamId, list);
      }
      const teams = [...teamRows.entries()]
        .map(([teamId, teamHistory]) => ({
          teamId,
          teamName: teamHistory.at(-1)?.teamName || "Team",
          points: teamHistory
            .map((row) => ({ weekStart: asWeek(row.weekStart), score: row.score }))
            .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
        }))
        .sort((a, b) => a.teamName.localeCompare(b.teamName));

      const averages = weeks.map((weekStart) => {
        const weekRows = rows.filter((row) => asWeek(row.weekStart) === weekStart);
        return { weekStart, score: average(weekRows.map((row) => row.score)) };
      });

      return {
        leagueId,
        name: leagueName(rows),
        weeks,
        teams,
        averages,
        latestWeek,
        currentAverage,
        delta,
        currentRows,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const firstStoredWeek = leagues.flatMap((league) => league.weeks).sort().at(0) || null;

  return (
    <div className="space-y-6 text-white">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-emerald-300">SIXFL TV Priority</p>
        <h1 className="text-3xl font-bold">Priority overview</h1>
        <p className="max-w-4xl text-sm leading-6 text-white/60">
          Permanent weekly history for every team&apos;s SIXFL TV Priority Score. The live score still uses the
          last five completed matches, but these weekly snapshots are retained indefinitely so the long-term
          trend does not disappear as older matches roll out of the scoring window.
        </p>
        <p className="text-xs leading-5 text-white/45">
          {firstStoredWeek
            ? `History currently starts with the week of ${fullWeekLabel(firstStoredWeek)}. Earlier weeks are not reconstructed or guessed.`
            : "The first weekly snapshot will appear as soon as active league teams are available."}
        </p>
      </header>

      {leagues.length ? (
        <div className="space-y-7">
          {leagues.map((league) => {
            const roundedAverage = league.currentAverage.toFixed(1);
            const trend = league.delta == null
              ? { symbol: "•", label: "First stored week", className: "text-white/50" }
              : league.delta > 0.05
                ? { symbol: "↑", label: `${league.delta.toFixed(1)} points vs previous week`, className: "text-emerald-300" }
                : league.delta < -0.05
                  ? { symbol: "↓", label: `${Math.abs(league.delta).toFixed(1)} points vs previous week`, className: "text-red-300" }
                  : { symbol: "→", label: "No meaningful change vs previous week", className: "text-white/55" };
            const qualified = league.currentRows.filter((row) => row.qualifies).length;

            return (
              <section key={league.leagueId} className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{league.name}</h2>
                    <p className="mt-1 text-sm text-white/50">
                      {league.teams.length} team{league.teams.length === 1 ? "" : "s"} · {league.weeks.length} stored week{league.weeks.length === 1 ? "" : "s"}
                      {league.latestWeek ? ` · latest ${fullWeekLabel(league.latestWeek)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="min-w-36 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200/70">League average</p>
                      <p className="mt-1 text-3xl font-black text-white">{roundedAverage}</p>
                      <p className={`mt-1 text-xs font-bold ${trend.className}`}>{trend.symbol} {trend.label}</p>
                    </div>
                    <div className="min-w-32 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45">Qualifying now</p>
                      <p className="mt-1 text-3xl font-black">{qualified}/{league.currentRows.length}</p>
                      <p className="mt-1 text-xs text-white/45">Current weekly snapshot</p>
                    </div>
                  </div>
                </div>

                <PriorityLeagueChart weeks={league.weeks} teams={league.teams} averages={league.averages} />

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
                  <span>The green line is the league average. Provisional team scores are included in the average.</span>
                  <Link href={`/admin/leagues/${league.leagueId}/veo-priority`} className="font-semibold text-emerald-300 hover:text-emerald-200">
                    Open league Priority →
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
          No Priority history has been captured yet.
        </div>
      )}
    </div>
  );
}
