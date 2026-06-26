// ========================================
// File: src/app/(admin)/admin/referee-nights/page.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  type RefereeNightStatus,
} from "@/lib/referee-nights";
import { getRefereeProfilesByUserIds } from "@/lib/referees/profile";
import { createRefereeNightAction } from "./actions";

function statusClasses(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "SETTLED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "REOPENED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "DRAFT":
    default:
      return "border-white/10 bg-white/[0.05] text-white/70";
  }
}

function formatStatus(status: RefereeNightStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function AdminRefereeNightsPage() {
  await requireAdmin();

  const [nights, referees, leagues, venues] = await Promise.all([
    getRefereeNightSummaries(),
    prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.REFEREE, UserRole.ADMIN],
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, season: true },
    }),
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const refereeProfileMap = await getRefereeProfilesByUserIds(referees.map((referee) => referee.id));

  const submittedCount = nights.filter((night) => night.status === "SUBMITTED").length;
  const unsettledCount = nights.filter(
    (night) => night.status !== "SETTLED" && night.status !== "CANCELLED",
  ).length;
  const dueToSixfl = nights.reduce((sum, night) => sum + night.dueToSixflPence, 0);
  const dueToReferees = nights.reduce((sum, night) => sum + night.dueToRefereePence, 0);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Referee nights
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Night-led referee control
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Assign a referee to a night, attach the fixtures for that night, set the night fee and review the end-of-night cashup.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Nights</div>
              <div className="mt-1 text-lg font-semibold text-white">{nights.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Submitted</div>
              <div className="mt-1 text-lg font-semibold text-white">{submittedCount}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Due SIXFL</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatMoney(dueToSixfl)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Due refs</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatMoney(dueToReferees)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Create night</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Set up a referee night</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Choose the league, date and venue. Matching fixtures will be attached automatically. Leave the fee blank to use the referee's saved standard night fee.
            </p>
          </div>

          <form action={createRefereeNightAction} className="space-y-5 px-6 py-6">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Referee</label>
              <select name="refereeId" required className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none">
                <option value="">Choose referee</option>
                {referees.map((referee) => {
                  const profile = refereeProfileMap.get(referee.id);
                  const feeLabel = profile?.standardNightFeePence ? ` · standard ${formatMoney(profile.standardNightFeePence)}` : "";
                  const activeLabel = profile?.isActive === false ? " · inactive" : "";

                  return (
                    <option key={referee.id} value={referee.id}>
                      {referee.name || referee.email || "Unnamed referee"}{referee.role === "ADMIN" ? " · admin" : ""}{feeLabel}{activeLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">League</label>
              <select name="leagueId" required className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none">
                <option value="">Choose league</option>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}{league.season ? ` · ${league.season}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Venue</label>
              <select name="venueId" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none">
                <option value="">Any venue for this league/date</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>{venue.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Night date</label>
                <input type="date" name="nightDate" required className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Night fee (£)</label>
                <input type="number" name="feePounds" step="0.01" min="0" placeholder="Blank = saved standard fee" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Admin notes</label>
              <textarea name="adminNotes" rows={3} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none" placeholder="Optional notes for the night" />
            </div>

            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
              Create referee night
            </button>
          </form>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Night ledger</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Referee nights</h2>
              </div>
              <div className="text-sm text-white/45">{unsettledCount} open or submitted</div>
            </div>
          </div>

          {nights.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/60">No referee nights created yet.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {nights.map((night) => (
                <Link
                  key={night.id}
                  href={`/admin/referee-nights/${night.id}`}
                  className="block px-6 py-5 transition hover:bg-white/[0.04]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                          {formatStatus(night.status)}
                        </span>
                        <span className="text-sm text-white/50">{formatNightDate(night.nightDate)}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-white">
                        {night.refereeName || night.refereeEmail || "Unnamed referee"}
                      </h3>
                      <p className="mt-1 text-sm text-white/55">
                        {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}{night.venueName ? ` · ${night.venueName}` : ""}
                      </p>
                    </div>

                    <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><div className="text-white/35">Fixtures</div><div className="font-semibold text-white">{night.fixtureCount}</div></div>
                      <div><div className="text-white/35">Fee</div><div className="font-semibold text-white">{formatMoney(night.feePence)}</div></div>
                      <div><div className="text-white/35">Collected</div><div className="font-semibold text-white">{formatMoney(night.cashCollectedPence)}</div></div>
                      <div><div className="text-white/35">Due SIXFL</div><div className="font-semibold text-white">{formatMoney(night.dueToSixflPence)}</div></div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
