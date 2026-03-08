// src/app/admin/leagues/page.tsx

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  createLeagueAction,
  deleteLeagueAction,
  toggleLeagueActiveAction,
} from "./actions";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";

export default async function AdminLeaguesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    deleted?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const deleted = sp.deleted === "1";
  const error = sp.error;

  const leagues = await prisma.league.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
    include: {
      _count: {
        select: {
          teams: true,
          fixtures: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leagues</h1>

        <Link
          href="/admin/fixtures"
          className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5"
        >
          Back to fixtures
        </Link>
      </div>

      {(deleted || error) && (
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
          {deleted && <div className="text-emerald-300">League deleted.</div>}

          {error === "has_teams" && (
            <div className="text-red-300">
              Can’t delete this league because teams are still assigned to it.
            </div>
          )}

          {error === "has_fixtures" && (
            <div className="text-red-300">
              Can’t delete this league because fixtures already exist for it.
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 p-6">
        <h2 className="text-lg font-semibold">Create league</h2>

        <form action={createLeagueAction} className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm text-white/70">
                League name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="e.g. Ripon Monday League"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="season" className="text-sm text-white/70">
                Season
              </label>
              <input
                id="season"
                name="season"
                type="text"
                placeholder="e.g. Spring 2026"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked
              className="h-4 w-4 rounded border-white/20 bg-black/20"
            />
            Set league as active
          </label>

          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-500"
          >
            Create league
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-white/10">
        <div className="border-b border-white/10 px-4 py-3 text-sm font-medium">
          Existing leagues
        </div>

        {leagues.length === 0 ? (
          <div className="p-4 text-white/60">No leagues created yet.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {leagues.map((league) => (
              <div
                key={league.id}
                className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-medium">{league.name}</div>

                    {league.season ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70">
                        {league.season}
                      </span>
                    ) : null}

                    {league.isActive ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60">
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                    <span>{league._count.teams} teams</span>
                    <span>•</span>
                    <span>{league._count.fixtures} fixtures</span>
                    <span>•</span>
                    <span className="font-mono">{league.id}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/leagues/${league.id}`}
                    className="rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                  >
                    View public page
                  </Link>

                  <form action={toggleLeagueActiveAction}>
                    <input type="hidden" name="id" value={league.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
                    >
                      {league.isActive ? "Set inactive" : "Set active"}
                    </button>
                  </form>

                  <form action={deleteLeagueAction}>
                    <input type="hidden" name="id" value={league.id} />
                    <ConfirmDeleteButton
                      label="Delete"
                      confirmText={`Delete "${league.name}"? This cannot be undone.`}
                      className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/15"
                    />
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}