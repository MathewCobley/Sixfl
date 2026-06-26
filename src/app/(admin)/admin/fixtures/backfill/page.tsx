// ========================================
// File: src/app/(admin)/admin/fixtures/backfill/page.tsx
// ========================================

import Link from "next/link";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { backfillFixtureMatchFeeChargesAction } from "../generate/actions";
import { backfillRefereeAssignmentsAction } from "../generate/referee-backfill-actions";

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
};

function leagueLabel(league: { name: string; season: string | null }) {
  return league.season ? `${league.name} • ${league.season}` : league.name;
}

function refereeLabel(referee: { name: string | null; email: string | null }) {
  if (referee.name && referee.email) return `${referee.name} • ${referee.email}`;
  return referee.name || referee.email || "Unnamed referee";
}

export default async function FixtureBackfillPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};

  const [leagues, referees] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, season: true },
    }),
    prisma.user.findMany({
      where: { role: "REFEREE" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const backfilledCount = Number(sp.backfilled ?? "");
  const paymentRequestCount = Number(sp.paymentRequests ?? "");
  const hasFeeNotice = Number.isFinite(backfilledCount) && sp.backfilled !== undefined;

  const refereeBackfilledCount = Number(sp.refBackfilled ?? "");
  const refereeAssignedCount = Number(sp.refAssigned ?? "");
  const refereeEmailCount = Number(sp.refEmails ?? "");
  const hasRefereeNotice = Number.isFinite(refereeBackfilledCount) && sp.refBackfilled !== undefined;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/fixtures" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to fixtures
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Fixture backfill tools
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Use these tools when fixtures already exist but you need to add payment charges or referee assignments without resending team fixture emails.
        </p>
      </div>

      {hasFeeNotice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Backfilled payment charges for {backfilledCount} fixture{backfilledCount === 1 ? "" : "s"}. Queued {Number.isFinite(paymentRequestCount) ? paymentRequestCount : 0} payment message{paymentRequestCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      {hasRefereeNotice ? (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100">
          Linked {refereeBackfilledCount} fixture{refereeBackfilledCount === 1 ? "" : "s"} to referee night{refereeBackfilledCount === 1 ? "" : "s"}. Filled {Number.isFinite(refereeAssignedCount) ? refereeAssignedCount : 0} blank referee assignment{refereeAssignedCount === 1 ? "" : "s"}. Queued {Number.isFinite(refereeEmailCount) ? refereeEmailCount : 0} referee email{refereeEmailCount === 1 ? "" : "s"}.
        </div>
      ) : null}

      <AdminCard className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.06] p-6 md:p-8">
        <form action={backfillFixtureMatchFeeChargesAction} className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">Existing fixtures</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Backfill missing match fee charges</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Adds payment charges to upcoming scheduled fixtures that do not already have active charges. It does not amend fixtures or send amended fixture emails.
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
                Queues standard match-fee payment messages and future reminders. Team fixture emails are not resent.
              </span>
            </span>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 px-6 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/20">
            Backfill missing charges
          </button>
        </form>
      </AdminCard>

      <AdminCard className="rounded-3xl border border-sky-400/25 bg-sky-500/[0.06] p-6 md:p-8">
        <form action={backfillRefereeAssignmentsAction} className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-200/80">Existing fixtures</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Backfill referee assignments</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Fills blank referee assignments from the pitch referees below, creates referee nights, and queues referee emails only. Team fixture emails are not resent.
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
            <p className="mt-2 text-sm leading-6 text-white/55">
              Existing referee assignments are kept. Blank assignments are filled using the fixture pitch number.
            </p>
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
              <span className="mt-1 block text-sm leading-6 text-white/55">
                Sends referee-only assignment emails for newly linked referee nights. Team fixture emails are not resent.
              </span>
            </span>
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/15 px-6 text-sm font-semibold text-sky-50 transition hover:bg-sky-500/20">
            Backfill referee assignments
          </button>
        </form>
      </AdminCard>
    </div>
  );
}
