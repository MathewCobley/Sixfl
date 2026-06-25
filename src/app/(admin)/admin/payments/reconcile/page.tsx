// ========================================
// File: src/app/(admin)/admin/payments/reconcile/page.tsx
// ========================================

import Link from "next/link";

import { reconcileFixtureChargeFromPlayerPayments } from "@/lib/payments/player-match-fee-reconciliation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Reconcile Squad Payments | SIXFL Admin",
};

type ReconcileResult = {
  teamId: string;
  fixtureId: string;
  teamName: string;
  fixtureLabel: string;
  chargeId: string | null;
  paidTotalPence: number;
  covered: boolean;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

async function reconcilePaidPlayerMatchFees() {
  await requireAdmin();

  const paidFees = await prisma.playerMatchFee.findMany({
    where: { status: "PAID" },
    select: {
      teamId: true,
      fixtureId: true,
      team: { select: { name: true } },
      fixture: {
        select: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  const pairs = new Map<string, (typeof paidFees)[number]>();
  for (const fee of paidFees) {
    pairs.set(`${fee.teamId}:${fee.fixtureId}`, fee);
  }

  const results: ReconcileResult[] = [];

  for (const fee of pairs.values()) {
    const result = await reconcileFixtureChargeFromPlayerPayments({
      teamId: fee.teamId,
      fixtureId: fee.fixtureId,
    });

    results.push({
      teamId: fee.teamId,
      fixtureId: fee.fixtureId,
      teamName: fee.team.name,
      fixtureLabel: `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`,
      chargeId: result?.chargeId ?? null,
      paidTotalPence: result?.paidTotalPence ?? 0,
      covered: Boolean(result?.covered),
    });
  }

  return results.sort((a, b) => a.teamName.localeCompare(b.teamName));
}

export default async function AdminReconcileSquadPaymentsPage() {
  const results = await reconcilePaidPlayerMatchFees();
  const matched = results.filter((result) => result.chargeId);
  const unmatched = results.filter((result) => !result.chargeId);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/70">
          Admin reconciliation
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Squad payment reconciliation</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-emerald-50/75">
          This page checks paid player match fees and reconciles them back to the matching team charge by fixture or fixture date. It is safe to run more than once.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/payments"
            className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-black/30"
          >
            Back to payments
          </Link>
          <Link
            href="/admin/payments/reconcile"
            className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-300 px-5 py-3 text-sm font-bold text-black transition hover:bg-emerald-200"
          >
            Run again
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Checked</p>
          <p className="mt-3 text-3xl font-semibold text-white">{results.length}</p>
          <p className="mt-2 text-sm text-white/55">Team/fixture combinations with paid squad payments.</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Matched</p>
          <p className="mt-3 text-3xl font-semibold text-white">{matched.length}</p>
          <p className="mt-2 text-sm text-emerald-100/75">Linked to a team charge.</p>
        </div>
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Unmatched</p>
          <p className="mt-3 text-3xl font-semibold text-white">{unmatched.length}</p>
          <p className="mt-2 text-sm text-amber-100/75">May need a charge creating or checking manually.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">Results</h2>
        </div>
        <div className="divide-y divide-white/10">
          {results.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">No paid player match fees found.</div>
          ) : (
            results.map((result) => (
              <div key={`${result.teamId}:${result.fixtureId}`} className="px-6 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-white">{result.teamName}</div>
                    <div className="mt-1 text-sm text-white/55">{result.fixtureLabel}</div>
                    <div className="mt-1 text-xs text-white/40">Fixture ID: {result.fixtureId}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white/70">
                      Squad paid {formatMoney(result.paidTotalPence)}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        result.chargeId
                          ? result.covered
                            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                            : "border-sky-400/25 bg-sky-500/10 text-sky-100"
                          : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                      }`}
                    >
                      {result.chargeId ? (result.covered ? "Covered" : "Part paid") : "No charge matched"}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
