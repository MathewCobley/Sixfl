// ========================================
// File: src/app/pay/charge/[token]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getChargeOutstandingPence,
  getChargePaidTotal,
} from "@/lib/payments/charge-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PayChargePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const charge = await prisma.paymentCharge.findUnique({
    where: {
      paymentToken: token,
    },
    select: {
      id: true,
      title: true,
      description: true,
      amountPence: true,
      dueDate: true,
      status: true,
      paymentToken: true,
      team: {
        select: {
          name: true,
        },
      },
      fixture: {
        select: {
          status: true,
          kickoffAt: true,
          league: {
            select: {
              slug: true,
              name: true,
              season: true,
            },
          },
          homeTeam: {
            select: {
              name: true,
            },
          },
          awayTeam: {
            select: {
              name: true,
            },
          },
        },
      },
      transactions: {
        select: {
          amountPence: true,
        },
      },
    },
  });

  if (!charge) {
    notFound();
  }

  const paidTotalPence = getChargePaidTotal(charge.transactions);
  const outstandingPence = getChargeOutstandingPence(
    charge.amountPence,
    paidTotalPence,
  );
  const fixturesHref = charge.fixture?.league?.slug
    ? `/leagues/${charge.fixture.league.slug}/fixtures`
    : "/";
  const fixtureStillPayable = !charge.fixture || charge.fixture.status === "SCHEDULED" || charge.fixture.status === "COMPLETED";
  const canPay =
    charge.status !== "VOID" &&
    fixtureStillPayable &&
    outstandingPence > 0 &&
    Boolean(charge.paymentToken);

  return (
    <div className="min-h-screen bg-[#050816] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Secure online payment
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Match fee payment
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-6 text-white/60">
            Pay this open match-fee charge securely online.
          </p>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Charge
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                {charge.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {charge.description || "SIXFL fixture match fee."}
              </p>

              {charge.fixture ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/70">
                  <div className="font-medium text-white">
                    {charge.fixture.homeTeam.name} vs {charge.fixture.awayTeam.name}
                  </div>
                  <div className="mt-1 text-white/50">
                    {formatKickoff(charge.fixture.kickoffAt)}
                  </div>
                  <div className="mt-1 text-white/50">
                    {charge.fixture.league.name}
                    {charge.fixture.league.season
                      ? ` • ${charge.fixture.league.season}`
                      : ""}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="min-w-[220px] rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-5 text-left lg:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
                Outstanding now
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatMoney(outstandingPence)}
              </div>
              <div className="mt-2 text-sm text-emerald-100/75">
                Paid {formatMoney(paidTotalPence)} of {formatMoney(charge.amountPence)}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/45">
                {charge.status}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            {canPay ? (
              <form action={`/pay/charge/${token}/start`} method="post" className="space-y-3">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
                >
                  Continue to secure payment
                </button>
                <p className="text-sm text-white/50">
                  Secure payment powered by Stripe.
                </p>
              </form>
            ) : charge.status === "VOID" || !fixtureStillPayable ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                This payment request is no longer active.
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                This charge has already been paid.
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-center">
          <Link
            href={fixturesHref}
            className="text-sm font-medium text-white/55 transition hover:text-white/80"
          >
            Back to fixtures
          </Link>
        </div>
      </div>
    </div>
  );
}
