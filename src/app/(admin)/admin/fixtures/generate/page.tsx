// ========================================
// File: src/app/(admin)/admin/fixtures/generate/page.tsx
// ========================================

import Link from "next/link";
import { FixtureStatus } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  backfillFixtureMatchFeeChargesAction,
  cancelUnpublishedFixturePaymentQueueAction,
  generateDraftFixturesWithPitchRefereesAction,
} from "./actions";
import { backfillRefereeAssignmentsAction } from "./referee-backfill-actions";

function leagueLabel(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} • ${league.season}` : league.name;
}

function refereeLabel(referee: { name: string | null; email: string | null }) {
  if (referee.name && referee.email) return `${referee.name} • ${referee.email}`;
  return referee.name || referee.email || "Unnamed referee";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const inputClass = "h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";
const labelClass = "mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45";

type SearchParams = {
  backfilled?: string;
  paymentRequests?: string;
  refBackfilled?: string;
  refAssigned?: string;
  refEmails?: string;
  unpublishedCancelled?: string;
  unpublishedVoided?: string;
  unpublishedEntries?: string;
};

export default async function ImprovedFixtureGeneratorPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};

  const [leagues, venues, referees] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, season: true },
    }),
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: "REFEREE" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const backfilledCount = Number(sp.backfilled ?? "");
  const paymentRequestCount = Number(sp.paymentRequests ?? "");
  const hasBackfillNotice = Number.isFinite(backfilledCount) && sp.backfilled !== undefined;

  const refereeBackfilledCount = Number(sp.refBackfilled ?? "");
  const refereeAssignedCount = Number(sp.refAssigned ?? "");
  const refereeEmailCount = Number(sp.refEmails ?? "");
  const hasRefereeBackfillNotice = Number.isFinite(refereeBackfilledCount) && sp.refBackfilled !== undefined;

  const unpublishedCancelled = Number(sp.unpublishedCancelled ?? "");
  const unpublishedVoided = Number(sp.unpublishedVoided ?? "");
  const unpublishedEntries = Number(sp.unpublishedEntries ?? "");
  const hasUnpublishedCleanupNotice = sp.unpublishedCancelled !== undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/fixtures" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to fixtures
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Bulk Fixture Generator
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Generate a full draft schedule with pitch-specific referees. Fixtures stay draft until they are published. Payment charges and payment messages must only be created for published fixtures.
        </p>
      </div>

      {hasUnpublishedCleanupNotice ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          Cancelled {Number.isFinite(unpublishedCancelled) ? unpublishedCancelled : 0} queued unpublished-fixture payment message{unpublishedCancelled === 1 ? "" : "s"}, marked {Number.isFinite(unpublishedEntries) ? unpublishedEntries : 0} queued message entr{unpublishedEntries === 1 ? "y" : "ies"} as cancelled, and voided {Number.isFinite(unpublishedVoided) ? unpublishedVoided : 0} unpublished-fixture charge{unpublishedVoided === 1 ? "" : "s"} with no payments.
        </div>
      ) : null}

      {hasBackfillNotice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Backfilled payment charges for {backfilledCount} published fixture{backfilledCount === 1 ? "" : "s"}. Queued {Number.isFinite(paymentRequestCount) ? paymentRequestCount : 0} payment message{paymentRequestCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      {hasRefereeBackfillNotice ? (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          Linked {refereeBackfilledCount} fixture{refereeBackfilledCount === 1 ? "" : "s"} to referee night{refereeBackfilledCount === 1 ? "" : "s"}. Filled {Number.isFinite(refereeAssignedCount) ? refereeAssignedCount : 0} blank referee assignment{refereeAssignedCount === 1 ? "" : "s"}. Queued {Number.isFinite(refereeEmailCount) ? refereeEmailCount : 0} referee email{refereeEmailCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-red-400/25 bg-red-500/[0.08] p-6 md:p-8">
        <form action={cancelUnpublishedFixturePaymentQueueAction} className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/80">Emergency cleanup</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Cancel unpublished fixture payment messages</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Cancels queued match-fee payment emails/SMS for unpublished fixtures and voids unpaid charges attached to unpublished fixtures. This protects draft fixtures from being sent out.
            </p>
          </div>
          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/20 px-6 text-sm font-semibold text-red-50 transition hover:bg-red-500/30">
            Cancel unpublished payment queue
          </button>
        </form>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.06] p-6 md:p-8">
        <form action={backfillFixtureMatchFeeChargesAction} className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">Published fixtures only</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Backfill missing match fee charges</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Use this for published fixtures already created without fees. It only adds payment charges to upcoming scheduled fixtures that have already been published and do not already have active charges.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className={labelClass}>League</label>
              <select name="leagueId" required className={inputClass}>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>{leagueLabel(league)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Team fee</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/45">£</span>
                <input type="number" name="matchFeePounds" min="0.01" step="0.01" defaultValue="40.00" className={`${inputClass} pl-8`} />
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <input type="checkbox" name="sendPaymentRequests" defaultChecked className="mt-1" />
            <span>
              <span className="block text-sm font-semibold text-white">Queue normal payment request emails/SMS</span>
              <span className="mt-1 block text-sm leading-6 text-white/55">
                Only for published fixtures. Draft and unpublished fixtures are ignored.
              </span>
            </span>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 px-6 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20">
            Backfill published fixture charges
          </button>
        </form>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-sky-400/25 bg-sky-500/[0.06] p-6 md:p-8">
        <form action={backfillRefereeAssignmentsAction} className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/80">Existing fixtures</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Backfill referee assignments</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Use this when fixtures already exist but referee nights/emails need setting up. It fills blank referee assignments from the pitch referees below, creates referee nights, and queues referee emails only. Team fixture emails are not resent.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className={labelClass}>League</label>
              <select name="leagueId" required className={inputClass}>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>{leagueLabel(league)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Referee night fee</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/45">£</span>
                <input type="number" name="refereeFeePounds" min="0" step="0.01" defaultValue="45.00" className={`${inputClass} pl-8`} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Pitch referees</p>
            <p className="mt-2 text-sm leading-6 text-white/55">Existing referee assignments are kept. Blank assignments are filled using the fixture pitch number.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index + 1}>
                  <label className={labelClass}>Pitch {index + 1} referee</label>
                  <select name={`refereeIdByPitch${index + 1}`} className={inputClass}>
                    <option value="">Leave blank</option>
                    {referees.map((referee) => (
                      <option key={referee.id} value={referee.id}>{refereeLabel(referee)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
            <input type="checkbox" name="sendRefereeEmails" defaultChecked className="mt-1" />
            <span>
              <span className="block text-sm font-semibold text-white">Queue referee assignment emails</span>
              <span className="mt-1 block text-sm leading-6 text-white/55">Sends referee-only assignment emails for newly linked referee nights. It will not send team fixture amendment emails.</span>
            </span>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/15 px-6 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/20">
            Backfill referee assignments
          </button>
        </form>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-emerald-400/15 bg-white/[0.03] p-6 md:p-8">
        <form action={generateDraftFixturesWithPitchRefereesAction} className="space-y-8">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>League</label>
              <select name="leagueId" required className={inputClass}>{leagues.map((league) => <option key={league.id} value={league.id}>{leagueLabel(league)}</option>)}</select>
            </div>
            <div><label className={labelClass}>Start date</label><input type="date" name="startDate" required className={inputClass} /></div>
            <div><label className={labelClass}>Start time</label><input type="time" name="startTime" defaultValue="19:00" required className={inputClass} /><p className="mt-2 text-xs leading-5 text-white/45">First kick-off time. 19:00 means 7pm UK time.</p></div>
            <div><label className={labelClass}>Last game start time</label><input type="time" name="lastGameStartTime" defaultValue="20:20" required className={inputClass} /><p className="mt-2 text-xs leading-5 text-white/45">Example: 19:00 start, 20:20 last game, 40 min slots = 19:00, 19:40 and 20:20.</p></div>
            <div><label className={labelClass}>Venue</label><select name="venueId" className={inputClass}><option value="">No venue</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></div>
            <div><label className={labelClass}>Fixture status</label><select name="status" defaultValue={FixtureStatus.SCHEDULED} className={inputClass}><option value={FixtureStatus.SCHEDULED}>Scheduled</option><option value={FixtureStatus.POSTPONED}>Postponed</option><option value={FixtureStatus.CANCELLED}>Cancelled</option></select><p className="mt-2 text-xs leading-5 text-white/45">Generated fixtures stay draft until you publish a selected week.</p></div>
            <div><label className={labelClass}>Pitches</label><input type="number" name="pitches" min={1} max={6} defaultValue={2} className={inputClass} /><p className="mt-2 text-xs leading-5 text-white/45">The generator fills Pitch 1, Pitch 2, etc. before moving to the next slot.</p></div>
            <div><label className={labelClass}>Slot minutes</label><input type="number" name="slotMinutes" min={10} defaultValue={40} className={inputClass} /></div>
            <div><label className={labelClass}>Week gap days</label><input type="number" name="weekGapDays" min={1} defaultValue={7} className={inputClass} /></div>
            <div><label className={labelClass}>Start week</label><input type="number" name="startRound" min={1} defaultValue={1} className={inputClass} /></div>
          </div>

          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">Payment safety rule</p>
            <h2 className="mt-2 text-xl font-semibold text-white">No payment charges for draft fixtures</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-50/70">Generated fixtures are drafts. Payment charges and payment request messages are only created after fixtures are published.</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Pitch referees</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Assign one referee per pitch</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Pitch 1 uses the Pitch 1 referee, Pitch 2 uses the Pitch 2 referee, and so on.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index + 1}>
                  <label className={labelClass}>Pitch {index + 1} referee</label>
                  <select name={`refereeIdByPitch${index + 1}`} className={inputClass}><option value="">Unassigned</option>{referees.map((referee) => <option key={referee.id} value={referee.id}>{refereeLabel(referee)}</option>)}</select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex min-h-[112px] cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4"><input type="checkbox" name="doubleRoundRobin" className="mt-1" /><span><span className="block text-sm font-semibold text-white">Double round robin</span><span className="mt-1 block text-sm leading-6 text-white/50">Every team plays each opponent twice.</span></span></label>
            <label className="flex min-h-[112px] cursor-pointer items-start gap-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4"><input type="checkbox" name="clearExisting" className="mt-1" /><span><span className="block text-sm font-semibold text-red-100">Clear existing fixtures first</span><span className="mt-1 block text-sm leading-6 text-red-100/65">Only tick this when regenerating a schedule from scratch.</span></span></label>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">Generate draft fixtures</button>
            <p className="text-sm leading-6 text-white/45">Draft fixtures do not create payment charges or payment messages.</p>
          </div>
        </form>
      </AdminCard>
    </div>
  );
}
