// ========================================
// File: src/app/(admin)/admin/referee-nights/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  formatKickoffTime,
  formatMoney,
  formatNightDate,
  getCashCollectedByTeam,
  getRefereeNightById,
  getRefereeNightFixtures,
  type RefereeNightStatus,
} from "@/lib/referee-nights";
import {
  approveRefereeNightAction,
  refreshRefereeNightFixturesAction,
  reopenRefereeNightAction,
  settleRefereeNightAction,
  updateRefereeNightAction,
} from "../actions";

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

export default async function AdminRefereeNightDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [night, fixtures, cashByTeam] = await Promise.all([
    getRefereeNightById(id),
    getRefereeNightFixtures(id),
    getCashCollectedByTeam(id),
  ]);

  if (!night) notFound();

  const expectedTotal = fixtures.reduce((sum, fixture) => {
    return sum + fixture.paymentCharges.reduce((chargeSum, charge) => chargeSum + charge.amountPence, 0);
  }, 0);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/admin/referee-nights" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
              ← Referee nights
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                {formatStatus(night.status)}
              </span>
              <span className="text-sm text-white/55">{formatNightDate(night.nightDate)}</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              {night.refereeName || night.refereeEmail || "Unnamed referee"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}{night.venueName ? ` · ${night.venueName}` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Fixtures</div><div className="mt-1 text-lg font-semibold text-white">{fixtures.length}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Fee</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(night.feePence)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Expected</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(expectedTotal)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Collected</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(night.cashCollectedPence)}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><div className="text-[11px] uppercase tracking-[0.16em] text-white/40">Due SIXFL</div><div className="mt-1 text-lg font-semibold text-white">{formatMoney(night.dueToSixflPence)}</div></div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Night fixtures</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Fixtures covered</h2>
              </div>
              <form action={refreshRefereeNightFixturesAction}>
                <input type="hidden" name="refereeNightId" value={night.id} />
                <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                  Refresh fixtures
                </button>
              </form>
            </div>
          </div>

          {fixtures.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/60">
              No fixtures are attached yet. Check the league, date and venue, then refresh fixtures.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {fixtures.map((fixture) => {
                const homeCollected = cashByTeam[fixture.homeTeam.id] ?? 0;
                const awayCollected = cashByTeam[fixture.awayTeam.id] ?? 0;
                const homeCharge = fixture.paymentCharges.find((charge) => charge.teamId === fixture.homeTeam.id);
                const awayCharge = fixture.paymentCharges.find((charge) => charge.teamId === fixture.awayTeam.id);

                return (
                  <div key={fixture.id} className="px-6 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                          <span>{formatKickoffTime(fixture.kickoffAt)}</span>
                          {fixture.pitch ? <><span>•</span><span>{fixture.pitch}</span></> : null}
                          {fixture.round ? <><span>•</span><span>Week {fixture.round}</span></> : null}
                          <span>•</span><span>{fixture.status}</span>
                        </div>
                        <div className="mt-2 text-lg font-semibold text-white">
                          {fixture.homeTeam.name} <span className="text-white/35">v</span> {fixture.awayTeam.name}
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          {fixture.result ? `Result: ${fixture.result.homeScore}-${fixture.result.awayScore}${fixture.result.isDisputed ? " · disputed" : ""}` : "No result entered"}
                        </div>
                      </div>

                      <div className="grid min-w-[300px] grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="font-semibold text-white">{fixture.homeTeam.name}</div>
                          <div className="mt-1 text-white/45">Charge {formatMoney(homeCharge?.amountPence ?? 0)}</div>
                          <div className="mt-1 text-emerald-200">Collected {formatMoney(homeCollected)}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                          <div className="font-semibold text-white">{fixture.awayTeam.name}</div>
                          <div className="mt-1 text-white/45">Charge {formatMoney(awayCharge?.amountPence ?? 0)}</div>
                          <div className="mt-1 text-emerald-200">Collected {formatMoney(awayCollected)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Settings</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Night fee</h2>
            </div>
            <form action={updateRefereeNightAction} className="space-y-5 px-6 py-6">
              <input type="hidden" name="refereeNightId" value={night.id} />
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Night fee (£)</label>
                <input name="feePounds" type="number" min="0" step="0.01" defaultValue={(night.feePence / 100).toFixed(2)} className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Admin notes</label>
                <textarea name="adminNotes" rows={4} defaultValue={night.adminNotes ?? ""} className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none" />
              </div>
              <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300">
                Save night
              </button>
            </form>
          </div>

          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Settlement</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Cashup summary</h2>
            </div>
            <div className="space-y-3 px-6 py-6 text-sm">
              <div className="flex justify-between gap-4"><span className="text-white/55">Collected from teams</span><span className="font-semibold text-white">{formatMoney(night.cashCollectedPence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Referee night fee</span><span className="font-semibold text-white">{formatMoney(night.feePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Ref keeps from cash</span><span className="font-semibold text-white">{formatMoney(night.retainedByRefereePence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">Ref owes SIXFL</span><span className="font-semibold text-emerald-200">{formatMoney(night.dueToSixflPence)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-white/55">SIXFL owes ref</span><span className="font-semibold text-amber-200">{formatMoney(night.dueToRefereePence)}</span></div>

              {night.refereeNotes ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-white/70">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/35">Referee note</div>
                  {night.refereeNotes}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-4">
                <form action={approveRefereeNightAction}>
                  <input type="hidden" name="refereeNightId" value={night.id} />
                  <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/15">
                    Approve
                  </button>
                </form>
                <form action={settleRefereeNightAction}>
                  <input type="hidden" name="refereeNightId" value={night.id} />
                  <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15">
                    Mark settled
                  </button>
                </form>
                <form action={reopenRefereeNightAction}>
                  <input type="hidden" name="refereeNightId" value={night.id} />
                  <button type="submit" className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                    Reopen
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
