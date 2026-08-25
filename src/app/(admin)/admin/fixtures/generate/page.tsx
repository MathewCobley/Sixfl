// ========================================
// File: src/app/(admin)/admin/fixtures/generate/page.tsx
// ========================================

import Link from "next/link";
import { FixtureStatus } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import GenerateNextWeekFixturesPanel from "@/components/admin/fixtures/GenerateNextWeekFixturesPanel";
import { getAllLeagueDivisionOptions } from "@/lib/league-divisions";
import { getCurrentLeagueIds } from "@/lib/current-leagues";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  deleteUnpublishedFixturesAction,
  generateDraftFixturesWithDivisionsAction,
} from "./division-actions";
import { backfillRefereeAssignmentsAction } from "./referee-backfill-actions";
import { backfillStandardFixtureFeesAction } from "./standard-fee-actions";

function leagueLabel(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} • ${league.season}` : league.name;
}

function divisionLabel(division: {
  leagueName: string;
  leagueSeason: string | null;
  name: string;
}) {
  return `${leagueLabel({ name: division.leagueName, season: division.leagueSeason })} — ${division.name}`;
}

function refereeLabel(referee: { name: string | null; email: string | null }) {
  if (referee.name && referee.email) return `${referee.name} • ${referee.email}`;
  return referee.name || referee.email || "Unnamed referee";
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const inputClass =
  "h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";
const labelClass =
  "mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45";

type SearchParams = {
  standardFees?: string;
  standardFeeCharges?: string;
  backfilled?: string;
  paymentRequests?: string;
  refBackfilled?: string;
  refAssigned?: string;
  refEmails?: string;
  unpublishedDeleted?: string;
};

export default async function FixtureGeneratorPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const currentLeagueIds = await getCurrentLeagueIds();

  const [leagues, venues, referees, allDivisionOptions] = await Promise.all([
    prisma.league.findMany({
      where: { id: { in: currentLeagueIds } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
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
    getAllLeagueDivisionOptions(),
  ]);

  const currentLeagueIdSet = new Set(leagues.map((league) => league.id));
  const divisionOptions = allDivisionOptions.filter((division) =>
    currentLeagueIdSet.has(division.leagueId),
  );

  const standardFeeCount = Number(sp.standardFees ?? "");
  const standardFeeChargeCount = Number(sp.standardFeeCharges ?? "");
  const paymentRequestCount = Number(sp.paymentRequests ?? "");
  const hasStandardFeeNotice =
    Number.isFinite(standardFeeCount) && sp.standardFees !== undefined;

  const backfilledCount = Number(sp.backfilled ?? "");
  const hasLegacyBackfillNotice =
    Number.isFinite(backfilledCount) && sp.backfilled !== undefined;

  const refereeBackfilledCount = Number(sp.refBackfilled ?? "");
  const refereeAssignedCount = Number(sp.refAssigned ?? "");
  const refereeEmailCount = Number(sp.refEmails ?? "");
  const hasRefereeBackfillNotice =
    Number.isFinite(refereeBackfilledCount) && sp.refBackfilled !== undefined;

  const unpublishedDeletedCount = Number(sp.unpublishedDeleted ?? "");
  const hasUnpublishedDeletedNotice =
    Number.isFinite(unpublishedDeletedCount) && sp.unpublishedDeleted !== undefined;

  const noCurrentLeagues = leagues.length === 0;
  const leagueOptions = leagues.map((league) => ({
    id: league.id,
    label: leagueLabel(league),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/admin/fixtures"
          className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
        >
          ← Back to fixtures
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Generate fixtures
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Use <strong className="text-white">Generate one week</strong> for the normal weekly job.
          Use <strong className="text-white">Generate a full schedule</strong> only when setting up a new
          league or rebuilding a complete round-robin schedule. The repair tools at the bottom are for
          existing fixtures and are not part of normal weekly generation.
        </p>
      </div>

      {noCurrentLeagues ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          No current league seasons are available. Open a league and create or select its current season first.
        </div>
      ) : null}

      {hasStandardFeeNotice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Applied standard team fees to {standardFeeCount} fixture{standardFeeCount === 1 ? "" : "s"}.
          Created payment charges for {Number.isFinite(standardFeeChargeCount) ? standardFeeChargeCount : 0} published fixture{standardFeeChargeCount === 1 ? "" : "s"}.
          Queued {Number.isFinite(paymentRequestCount) ? paymentRequestCount : 0} payment message{paymentRequestCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      {hasLegacyBackfillNotice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Backfilled payment charges for {backfilledCount} published fixture{backfilledCount === 1 ? "" : "s"}.
          Queued {Number.isFinite(paymentRequestCount) ? paymentRequestCount : 0} payment message{paymentRequestCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      {hasRefereeBackfillNotice ? (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          Linked {refereeBackfilledCount} fixture{refereeBackfilledCount === 1 ? "" : "s"} to referee night{refereeBackfilledCount === 1 ? "" : "s"}.
          Filled {Number.isFinite(refereeAssignedCount) ? refereeAssignedCount : 0} blank referee assignment{refereeAssignedCount === 1 ? "" : "s"}.
          Queued {Number.isFinite(refereeEmailCount) ? refereeEmailCount : 0} referee email{refereeEmailCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      {hasUnpublishedDeletedNotice ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          Deleted {unpublishedDeletedCount} unpublished fixture{unpublishedDeletedCount === 1 ? "" : "s"}. Published/live fixtures were left untouched.
        </div>
      ) : null}

      <GenerateNextWeekFixturesPanel leagues={leagueOptions} />

      <AdminCard className="rounded-3xl border border-emerald-400/15 bg-white/[0.03] p-6 md:p-8">
        <form action={generateDraftFixturesWithDivisionsAction} className="space-y-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
              New league / full rebuild
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Generate a full schedule</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Creates every round in a round-robin schedule for the selected league or division, starting
              from the date and week number below. This is <strong className="text-white">not</strong> the normal
              one-week generator. All fixtures are created as drafts for review before publishing.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className={labelClass}>League / current season</label>
              <select name="leagueId" required disabled={noCurrentLeagues} className={inputClass}>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {leagueLabel(league)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Division to schedule</label>
              <select name="divisionId" className={inputClass} disabled={noCurrentLeagues}>
                <option value="">Whole league / league has no divisions</option>
                {divisionOptions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {divisionLabel(division)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-white/45">
                If the league has divisions, choose the exact division. Leave blank only for a league that does not use divisions.
              </p>
            </div>

            <div>
              <label className={labelClass}>Date of the first fixture night</label>
              <input type="date" name="startDate" required className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">
                Week 1 of the generated schedule starts on this date.
              </p>
            </div>

            <div>
              <label className={labelClass}>First kick-off</label>
              <input type="time" name="startTime" defaultValue="19:00" required className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">Example: 19:00 = first games start at 7pm.</p>
            </div>

            <div>
              <label className={labelClass}>Latest kick-off on the night</label>
              <input type="time" name="lastGameStartTime" defaultValue="20:20" required className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">
                With 40-minute slots, 19:00 to 20:20 gives kick-offs at 19:00, 19:40 and 20:20.
              </p>
            </div>

            <div>
              <label className={labelClass}>Venue</label>
              <select name="venueId" className={inputClass}>
                <option value="">No venue selected</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>{venue.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Number of pitches in use</label>
              <input type="number" name="pitches" min={1} defaultValue={2} className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">
                Example: 2 means two matches can kick off at the same time.
              </p>
            </div>

            <div>
              <label className={labelClass}>Minutes between kick-offs</label>
              <input type="number" name="slotMinutes" min={10} defaultValue={40} className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">
                Usually 40 minutes for SIXFL match slots.
              </p>
            </div>

            <div>
              <label className={labelClass}>Days between fixture nights</label>
              <input type="number" name="weekGapDays" min={1} defaultValue={7} className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">
                Leave at 7 for a normal weekly league.
              </p>
            </div>

            <div>
              <label className={labelClass}>First week number to create</label>
              <input type="number" name="startRound" min={1} defaultValue={1} className={inputClass} />
              <p className="mt-2 text-xs leading-5 text-white/45">
                Use 1 for a new season. Change this only when continuing from a later week.
              </p>
            </div>

            <div>
              <label className={labelClass}>Initial fixture status</label>
              <select name="status" defaultValue={FixtureStatus.SCHEDULED} className={inputClass}>
                <option value={FixtureStatus.SCHEDULED}>Scheduled</option>
                <option value={FixtureStatus.POSTPONED}>Postponed</option>
                <option value={FixtureStatus.CANCELLED}>Cancelled</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-white/45">
                Normally leave this as Scheduled. The fixtures are still unpublished drafts until you publish them.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/25 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Referees</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Optional: assign a referee to each pitch</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              If you already know the referee rota, choose the referee for each pitch. Leave a pitch unassigned if you will fill it later.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index + 1}>
                  <label className={labelClass}>Pitch {index + 1}</label>
                  <select name={`refereeIdByPitch${index + 1}`} className={inputClass}>
                    <option value="">No referee yet</option>
                    {referees.map((referee) => (
                      <option key={referee.id} value={referee.id}>{refereeLabel(referee)}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex min-h-[120px] cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <input type="checkbox" name="doubleRoundRobin" className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-white">Play every opponent twice</span>
                <span className="mt-1 block text-sm leading-6 text-white/50">
                  Creates a second set of meetings so every pairing happens twice. SIXFL has no home/away significance. Leave unticked if each pairing should happen once.
                </span>
              </span>
            </label>

            <label className="flex min-h-[120px] cursor-pointer items-start gap-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
              <input type="checkbox" name="clearExisting" className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-red-100">Delete existing drafts before creating this schedule</span>
                <span className="mt-1 block text-sm leading-6 text-red-100/65">
                  Deletes unpublished fixtures for this league/division first. Published fixtures are never deleted. Use this only when intentionally rebuilding the draft schedule.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
            <h3 className="text-lg font-semibold text-white">What happens after you click generate?</h3>
            <p className="mt-2 text-sm leading-6 text-amber-50/70">
              Fixtures are saved as unpublished drafts with the teams’ standard match fee attached. No team payment requests are sent until fixtures are published.
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={noCurrentLeagues}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate full draft schedule
            </button>
            <p className="text-sm leading-6 text-white/45">Review every generated fixture before publishing.</p>
          </div>
        </form>
      </AdminCard>

      <section className="space-y-4 border-t border-white/10 pt-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/35">Maintenance tools</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Fix existing fixtures</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            These tools do not generate a normal fixture week. Use them only when existing fixtures are missing fees/referee setup, or when you need to remove unpublished drafts.
          </p>
        </div>

        <AdminCard className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.06] p-6 md:p-8">
          <form action={backfillStandardFixtureFeesAction} className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">Repair tool</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Add missing team fees to existing fixtures</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
                Use this only if fixtures already exist but their standard match fees/payment charges are missing. Drafts get the fee stored; published fixtures can also receive missing payment charges.
              </p>
            </div>

            <div>
              <label className={labelClass}>League / current season to repair</label>
              <select name="leagueId" required disabled={noCurrentLeagues} className={inputClass}>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>{leagueLabel(league)}</option>
                ))}
              </select>
            </div>

            <label className="flex cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <input type="checkbox" name="sendPaymentRequests" defaultChecked className="mt-1" />
              <span>
                <span className="block text-sm font-semibold text-white">Send payment requests for any newly created published charges</span>
                <span className="mt-1 block text-sm leading-6 text-white/55">
                  This only affects published fixtures. Draft fixtures will not send messages.
                </span>
              </span>
            </label>

            <button type="submit" disabled={noCurrentLeagues} className="inline-flex h-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 px-6 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              Repair missing fixture fees
            </button>
          </form>
        </AdminCard>

        <AdminCard className="rounded-3xl border border-sky-400/25 bg-sky-500/[0.06] p-6 md:p-8">
          <form action={backfillRefereeAssignmentsAction} className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/80">Repair tool</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Add missing referees to existing fixtures</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
                Use this when fixtures are already created but referee assignments/referee nights are incomplete. Existing referee assignments are kept; only blanks are filled.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <label className={labelClass}>League / current season to repair</label>
                <select name="leagueId" required disabled={noCurrentLeagues} className={inputClass}>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>{leagueLabel(league)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Referee payment for the night</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/45">£</span>
                  <input type="number" name="refereeFeePounds" min="0" step="0.01" defaultValue="45.00" className={`${inputClass} pl-8`} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-sm leading-6 text-white/55">Choose which referee should fill blank assignments on each pitch.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index + 1}>
                    <label className={labelClass}>Pitch {index + 1}</label>
                    <select name={`refereeIdByPitch${index + 1}`} className={inputClass}>
                      <option value="">Do not fill this pitch</option>
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
                <span className="block text-sm font-semibold text-white">Email referees about newly repaired assignments</span>
                <span className="mt-1 block text-sm leading-6 text-white/55">
                  Referee assignment emails only. Team fixture emails are not resent.
                </span>
              </span>
            </label>

            <button type="submit" disabled={noCurrentLeagues} className="inline-flex h-12 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/15 px-6 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              Repair missing referee assignments
            </button>
          </form>
        </AdminCard>

        <AdminCard className="rounded-3xl border border-rose-400/25 bg-rose-500/[0.06] p-6 md:p-8">
          <form action={deleteUnpublishedFixturesAction} className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-200/80">Cleanup tool</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Delete draft fixtures</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
                Permanently removes unpublished draft fixtures for the selected league/division. Published/live fixtures are never deleted by this tool.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>League / current season</label>
                <select name="leagueId" required disabled={noCurrentLeagues} className={inputClass}>
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>{leagueLabel(league)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Which drafts to delete</label>
                <select name="divisionId" className={inputClass} disabled={noCurrentLeagues}>
                  <option value="">All unpublished fixtures in this league</option>
                  {divisionOptions.map((division) => (
                    <option key={division.id} value={division.id}>{divisionLabel(division)}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-white/45">
                  Choose a division to delete only its drafts, or leave blank for all drafts in the selected league.
                </p>
              </div>
            </div>

            <button type="submit" disabled={noCurrentLeagues} className="inline-flex h-12 items-center justify-center rounded-2xl border border-rose-300/30 bg-rose-500/15 px-6 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40">
              Delete draft fixtures
            </button>
          </form>
        </AdminCard>
      </section>
    </div>
  );
}
