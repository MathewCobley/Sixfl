// src/app/admin/fixtures/generate/page.tsx

import Link from "next/link";
import AdminCard from "@/components/admin/AdminCard";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { generateFixtures } from "../actions";
import { FixtureStatus } from "@prisma/client";

export default async function GenerateFixturesPage() {
  await requireAdmin();

  const [leagues, venues] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, season: true, isActive: true },
    }),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Default date
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const defaultDate = `${yyyy}-${mm}-${dd}`;

  return (
    <AdminCard title="Generate Fixtures">
      <div className="text-sm text-white/70">
        Generates a round-robin schedule for all teams assigned to a league.
      </div>

      <form action={generateFixtures} className="mt-4 space-y-4">
        {/* LEAGUE */}
        <div>
          <label className="mb-1 block text-sm text-white/70">League</label>
          <select
            name="leagueId"
            required
            defaultValue={leagues[0]?.id ?? ""}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
          >
            {leagues.length === 0 ? (
              <option value="">No leagues found</option>
            ) : (
              leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.season ? ` — ${l.season}` : ""}
                  {l.isActive ? "" : " (inactive)"}
                </option>
              ))
            )}
          </select>
        </div>

        {/* DATE + TIME */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-white/70">
              Start date
            </label>
            <input
              name="startDate"
              type="date"
              defaultValue={defaultDate}
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Start time
            </label>
            <input
              name="startTime"
              type="time"
              defaultValue="20:00"
              required
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
            />
          </div>
        </div>

        {/* SCHEDULING OPTIONS */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-white/70">
              Week gap (days)
            </label>
            <input
              name="weekGapDays"
              type="number"
              defaultValue={7}
              min={1}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Slot minutes
            </label>
            <input
              name="slotMinutes"
              type="number"
              defaultValue={40}
              min={10}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-white/70">
              Pitches
            </label>
            <input
              name="pitches"
              type="number"
              defaultValue={1}
              min={1}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
            />
          </div>
        </div>

        {/* ROUND */}
        <div>
          <label className="mb-1 block text-sm text-white/70">
            Starting round
          </label>
          <input
            name="startRound"
            type="number"
            defaultValue={1}
            min={1}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
          />
        </div>

        {/* VENUE */}
        <div>
          <label className="mb-1 block text-sm text-white/70">
            Venue (optional)
          </label>
          <select
            name="venueId"
            defaultValue=""
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
          >
            <option value="">No venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* STATUS */}
        <div>
          <label className="mb-1 block text-sm text-white/70">
            Fixture status
          </label>
          <select
            name="status"
            defaultValue="SCHEDULED"
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white outline-none"
          >
            {Object.values(FixtureStatus).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* OPTIONS */}
        <div className="flex flex-col gap-2 text-sm text-white/70">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="doubleRoundRobin" />
            Double round robin (home & away)
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" name="clearExisting" defaultChecked />
            Clear existing fixtures before generating
          </label>
        </div>

        {/* BUTTONS */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={leagues.length === 0}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400"
          >
            Generate fixtures
          </button>

          <Link
            href="/admin/fixtures"
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm hover:bg-black/30"
          >
            Back
          </Link>
        </div>
      </form>
    </AdminCard>
  );
}