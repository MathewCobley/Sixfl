// ========================================
// File: src/app/(public)/referee/page.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";
import { requireReferee } from "@/lib/admin";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  type RefereeNightStatus,
} from "@/lib/referee-nights";

function statusClasses(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "SETTLED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "REOPENED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "DRAFT":
    default:
      return "border-white/10 bg-white/[0.05] text-white/70";
  }
}

function formatStatus(status: RefereeNightStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function RefereePage() {
  const { user, isAdminPreview } = await requireReferee();

  const nights = await getRefereeNightSummaries(
    user.role === UserRole.ADMIN ? undefined : { refereeId: user.id },
  );

  const openNights = nights.filter(
    (night) => night.status !== "SETTLED" && night.status !== "CANCELLED",
  );
  const submittedNights = nights.filter((night) => night.status === "SUBMITTED");
  const dueToSixfl = nights.reduce((sum, night) => sum + night.dueToSixflPence, 0);
  const dueToReferee = nights.reduce((sum, night) => sum + night.dueToRefereePence, 0);

  return (
    <div className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {isAdminPreview ? (
          <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white">Referee preview mode</div>
                <p className="mt-1 text-amber-50/80">
                  You are seeing the live referee dashboard as {user.name || user.email || "this referee"}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/referees/${user.id}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${user.id}`)}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
                >
                  Switch back to admin view
                </Link>
                <Link
                  href={`/admin/referees/${user.id}`}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
                >
                  Open profile
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                Referee dashboard
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Your referee nights
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                Referee work is organised by night. Open a night to see the fixtures, enter scores, record cash collected and submit one cashup.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Open nights</div><div className="mt-1 text-lg font-semibold text-white">{openNights.length}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Submitted</div><div className="mt-1 text-lg font-semibold text-white">{submittedNights.length}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Due SIXFL</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(dueToSixfl)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Due to you</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(dueToReferee)}</div></div>
            </div>
          </div>
        </section>

        {nights.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center text-sm text-white/60">
            No referee nights are assigned yet. Once SIXFL assigns you to a night, it will appear here.
          </div>
        ) : (
          <section className="space-y-4">
            {nights.map((night) => (
              <Link
                key={night.id}
                href={`/referee/night/${night.id}`}
                className="block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition hover:border-emerald-400/25 hover:bg-white/[0.05]"
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                          {formatStatus(night.status)}
                        </span>
                        <span className="text-sm text-white/50">{formatNightDate(night.nightDate)}</span>
                      </div>
                      <h2 className="mt-3 text-xl font-semibold text-white">
                        {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
                      </h2>
                      <p className="mt-1 text-sm text-white/55">
                        {night.venueName || "Venue TBC"} · {night.fixtureCount} fixture{night.fixtureCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div><div className="text-white/35">Fee</div><div className="font-semibold text-white">{formatMoney(night.feePence)}</div></div>
                      <div><div className="text-white/35">Collected</div><div className="font-semibold text-white">{formatMoney(night.cashCollectedPence)}</div></div>
                      <div><div className="text-white/35">Due SIXFL</div><div className="font-semibold text-emerald-200">{formatMoney(night.dueToSixflPence)}</div></div>
                      <div><div className="text-white/35">Due to you</div><div className="font-semibold text-amber-200">{formatMoney(night.dueToRefereePence)}</div></div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
