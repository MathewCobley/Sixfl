// ========================================
// File: src/app/(admin)/admin/teams/new/page.tsx
// ========================================

import Link from "next/link";
import { getCurrentLeagueOptions } from "@/lib/current-leagues";
import { requireAdmin } from "@/lib/requireAdmin";
import { createTeamWithPlaceholderAction } from "./actions";

type Props = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function AdminNewTeamPage({ searchParams }: Props) {
  await requireAdmin();

  const leagues = await getCurrentLeagueOptions();
  const error = (await searchParams)?.error;

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

      {error === "placeholder_requires_league" ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          A fixture placeholder must be assigned to a league season.
        </div>
      ) : null}

      {error === "placeholder_exists" ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          That league already has a fixture placeholder team.
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 p-6">
        <form action={createTeamWithPlaceholderAction} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm text-white/70">
              Team name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="e.g. Ripon Rovers or TBC"
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
            <p className="text-xs text-white/50">
              Only current competition seasons are shown here. Previous seasons remain available from the season archive.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] p-4">
            <input
              type="checkbox"
              name="isFixturePlaceholder"
              className="mt-1 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-semibold text-amber-100">
                Fixture placeholder team
              </span>
              <span className="mt-1 block text-xs leading-5 text-amber-100/65">
                Use this for a TBC fixture slot. It remains selectable in Admin fixtures but is excluded from public tables, team counts and normal team operations. Only one placeholder is allowed per league season.
              </span>
            </span>
          </label>

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

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="contactName" className="text-sm text-white/70">
                Primary contact name
              </label>
              <input
                id="contactName"
                name="contactName"
                type="text"
                placeholder="John Smith"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contactEmail" className="text-sm text-white/70">
                Primary contact email
              </label>
              <input
                id="contactEmail"
                name="contactEmail"
                type="email"
                placeholder="captain@team.com"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="contactPhone" className="text-sm text-white/70">
                Primary contact mobile
              </label>
              <input
                id="contactPhone"
                name="contactPhone"
                type="text"
                placeholder="07700 900123"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="secondaryContactName"
                className="text-sm text-white/70"
              >
                Secondary contact name
              </label>
              <input
                id="secondaryContactName"
                name="secondaryContactName"
                type="text"
                placeholder="Assistant manager"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="secondaryContactEmail"
                className="text-sm text-white/70"
              >
                Secondary contact email
              </label>
              <input
                id="secondaryContactEmail"
                name="secondaryContactEmail"
                type="email"
                placeholder="assistant@team.com"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="secondaryContactPhone"
                className="text-sm text-white/70"
              >
                Secondary contact mobile
              </label>
              <input
                id="secondaryContactPhone"
                name="secondaryContactPhone"
                type="text"
                placeholder="07700 900456"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-0 placeholder:text-white/35"
              />
            </div>
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
            Claim code will be generated automatically when a normal team is created. Placeholder teams do not use captain or payment features.
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
