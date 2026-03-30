// ========================================
// File: src/app/admin/teams/new/page.tsx
// ========================================

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { createTeamAction } from "../actions";

export default async function AdminNewTeamPage() {
  await requireAdmin();

  const leagues = await prisma.league.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { season: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Create Team</h1>

        <Link
          href="/admin/teams"
          className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5"
        >
          Back to teams
        </Link>
      </div>

      <div className="rounded-xl border border-white/10 p-6">
        <form action={createTeamAction} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm text-white/70">
              Team name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Ripon Rovers"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="leagueId" className="text-sm text-white/70">
              League
            </label>
            <select
              id="leagueId"
              name="leagueId"
              defaultValue=""
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            >
              <option value="">No league</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                  {league.season ? ` • ${league.season}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="logoUrl" className="text-sm text-white/70">
              Logo URL
            </label>
            <input
              id="logoUrl"
              name="logoUrl"
              type="text"
              placeholder="/team-logos/ripon-rovers.png"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
            />
            <p className="text-xs text-white/50">
              For now, use a path like{" "}
              <span className="font-mono text-white/70">
                /team-logos/ripon-rovers.png
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="latestKickoffTime" className="text-sm text-white/70">
              Latest kickoff time
            </label>
            <input
              id="latestKickoffTime"
              name="latestKickoffTime"
              type="time"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0"
            />
            <p className="text-xs text-white/50">
              Leave blank if this team can play any slot. If set, generated
              fixtures will avoid kick-off times later than this.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-white/70">
            Claim code will be generated automatically when the team is created.
          </div>

          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
          >
            Create team
          </button>
        </form>
      </div>
    </div>
  );
}