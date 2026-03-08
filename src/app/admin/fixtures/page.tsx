// ========================================
// File: src/app/admin/fixtures/page.tsx
// ========================================

import AdminCard from "@/components/admin/AdminCard";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { createFixtureAction, deleteFixtureAction } from "./actions";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocalInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatLeagueLabel(
  league?: { name: string; season: string | null } | null
) {
  if (!league) return "No league";
  return league.season ? `${league.name} • ${league.season}` : league.name;
}

export default async function AdminFixturesPage() {
  await requireAdmin();

  const [fixtures, leagues, teams, venues, referees] = await Promise.all([
    prisma.fixture.findMany({
      orderBy: [{ kickoffAt: "asc" }],
      include: {
        league: { select: { id: true, name: true, season: true } },
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
        referee: { select: { id: true, name: true, email: true } },
        result: { select: { homeScore: true, awayScore: true } },
      },
    }),

    prisma.league.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { season: "asc" }],
      select: { id: true, name: true, season: true },
    }),

    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        leagueId: true,
        league: {
          select: { id: true, name: true, season: true },
        },
      },
    }),

    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),

    prisma.user.findMany({
      where: { role: UserRole.REFEREE },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const defaultLeagueId = leagues[0]?.id ?? "";
  const defaultKickoffAt = formatDateTimeLocalInput(new Date());

  const groups = new Map<string, typeof fixtures>();

  for (const f of fixtures) {
    const key = f.kickoffAt.toISOString().slice(0, 10);
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  const dates = Array.from(groups.keys()).sort();

  return (
    <div className="space-y-6 p-6">
      <AdminCard title="Create fixture">
        <form action={createFixtureAction} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* LEAGUE */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">League</label>
              <select
                name="leagueId"
                defaultValue={defaultLeagueId}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                required
              >
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name} {league.season ? `— ${league.season}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* HOME TEAM */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Home team</label>
              <select
                name="homeTeamId"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                required
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            {/* AWAY TEAM */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Away team</label>
              <select
                name="awayTeamId"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                required
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            {/* VENUE */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Venue</label>
              <select
                name="venueId"
                defaultValue=""
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                <option value="">No venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>

            {/* REFEREE */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Referee</label>
              <select
                name="refereeId"
                defaultValue=""
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                <option value="">Unassigned</option>
                {referees.map((ref) => (
                  <option key={ref.id} value={ref.id}>
                    {ref.name ?? ref.email}
                  </option>
                ))}
              </select>
            </div>

            {/* DATE */}
            <div className="space-y-2">
              <label className="text-sm text-white/70">Kickoff</label>
              <input
                name="kickoffAt"
                type="datetime-local"
                defaultValue={defaultKickoffAt}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
          >
            Create fixture
          </button>
        </form>
      </AdminCard>

      <AdminCard title="Fixtures">
        <div className="mt-4 space-y-4">
          {dates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-white/60">
              No fixtures yet.
            </div>
          ) : (
            dates.map((dateKey) => {
              const dayFixtures = groups.get(dateKey)!;
              const dayLabel = formatDate(new Date(`${dateKey}T00:00:00`));

              return (
                <div
                  key={dateKey}
                  className="overflow-hidden rounded-xl border border-white/10"
                >
                  <div className="border-b border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white">
                    {dayLabel}
                  </div>

                  <ul className="divide-y divide-white/10">
                    {dayFixtures.map((f) => (
                      <li key={f.id} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                                {formatLeagueLabel(f.league)}
                              </span>

                              {f.result ? (
                                <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-300">
                                  Result entered
                                </span>
                              ) : (
                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
                                  Awaiting result
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-white/60">
                              {formatTime(f.kickoffAt)}
                              {f.venue?.name ? ` • ${f.venue.name}` : ""}
                              {f.referee
                                ? ` • Ref: ${f.referee.name ?? f.referee.email}`
                                : ""}
                            </div>

                            <div className="text-sm font-medium text-white">
                              {f.homeTeam.name} vs {f.awayTeam.name}
                              {f.result && (
                                <span className="ml-2 text-white/70">
                                  ({f.result.homeScore}-{f.result.awayScore})
                                </span>
                              )}
                            </div>
                          </div>

                          <form action={deleteFixtureAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <button className="text-xs text-red-400 hover:text-red-300">
                              Delete
                            </button>
                          </form>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>
      </AdminCard>
    </div>
  );
}