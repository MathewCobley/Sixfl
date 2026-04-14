// ========================================
// File: src/app/captain/team/[teamid]/payments/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Captain Payments | SIXFL",
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatChargeStatus(status: string) {
  switch (status) {
    case "OPEN":
      return "Open";
    case "PART_PAID":
      return "Part paid";
    case "PAID":
      return "Paid";
    case "VOID":
      return "Void";
    default:
      return status.replaceAll("_", " ");
  }
}

function getChargeStatusTone(status: string) {
  switch (status) {
    case "OPEN":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100/80";
    case "PART_PAID":
      return "border-sky-400/20 bg-sky-500/10 text-sky-100/80";
    case "PAID":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/80";
    case "VOID":
      return "border-white/10 bg-white/[0.04] text-white/55";
    default:
      return "border-white/10 bg-white/[0.04] text-white/60";
  }
}

function getFixtureLabel(
  fixture:
    | {
        kickoffAt: Date;
        homeTeam: { name: string };
        awayTeam: { name: string };
      }
    | null
    | undefined,
) {
  if (!fixture) {
    return null;
  }

  return `${fixture.homeTeam.name} vs ${fixture.awayTeam.name} • ${formatDateTimeInLondon(
    fixture.kickoffAt,
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  )}`;
}

export default async function CaptainPaymentsPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      paymentCharges: {
        orderBy: [{ createdAt: "desc" }],
        include: {
          transactions: {
            select: {
              id: true,
              amountPence: true,
            },
          },
          fixture: {
            select: {
              id: true,
              kickoffAt: true,
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
        },
      },
      paymentTransactions: {
        orderBy: [{ paidAt: "desc" }],
        take: 20,
        select: {
          id: true,
          amountPence: true,
          method: true,
          reference: true,
          notes: true,
          paidAt: true,
          charge: {
            select: {
              title: true,
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const openCharges = team.paymentCharges.filter(
    (charge) => charge.status !== "PAID" && charge.status !== "VOID",
  );

  const outstandingTotal = openCharges.reduce((sum, charge) => {
    const paid = charge.transactions.reduce(
      (txSum, tx) => txSum + tx.amountPence,
      0,
    );

    return sum + Math.max(charge.amountPence - paid, 0);
  }, 0);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.75rem] border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Outstanding balance
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatMoney(outstandingTotal)}
          </p>
          <p className="mt-2 text-sm text-amber-100/75">
            Current unpaid balance across open team charges.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Open charges
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {openCharges.length}
          </p>
          <p className="mt-2 text-sm text-white/60">
            Team charges still awaiting payment or part payment.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Payment history
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {team.paymentTransactions.length}
          </p>
          <p className="mt-2 text-sm text-emerald-100/75">
            Most recent recorded team payments.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Charges
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Team payment ledger
          </h2>
        </div>

        <div className="divide-y divide-white/10">
          {team.paymentCharges.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No charges recorded yet.
            </div>
          ) : (
            team.paymentCharges.map((charge) => {
              const paid = charge.transactions.reduce(
                (sum, tx) => sum + tx.amountPence,
                0,
              );
              const outstanding = Math.max(charge.amountPence - paid, 0);
              const fixtureLabel = getFixtureLabel(charge.fixture);
              const canPayOnline =
                Boolean(charge.paymentToken) &&
                charge.status !== "PAID" &&
                charge.status !== "VOID" &&
                outstanding > 0;

              return (
                <div key={charge.id} className="px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {charge.title}
                        </div>

                        {fixtureLabel ? (
                          <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/75">
                            Fixture charge
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-white/55">
                        {charge.description || "No description"}
                      </div>

                      {fixtureLabel ? (
                        <div className="mt-2 text-sm text-emerald-100/75">
                          {fixtureLabel}
                        </div>
                      ) : null}

                      <div className="mt-1 text-sm text-white/45">
                        {charge.dueDate
                          ? `Due ${charge.dueDate.toLocaleDateString("en-GB")}`
                          : "No due date set"}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 lg:items-end">
                      <div className="text-right">
                        <div className="text-base font-semibold text-white">
                          {formatMoney(charge.amountPence)}
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          Paid {formatMoney(paid)} · Outstanding{" "}
                          {formatMoney(outstanding)}
                        </div>
                        <div className="mt-2">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                              getChargeStatusTone(charge.status),
                            ].join(" ")}
                          >
                            {formatChargeStatus(charge.status)}
                          </span>
                        </div>
                      </div>

                      {canPayOnline ? (
                        <Link
                          href={`/pay/charge/${charge.paymentToken}`}
                          className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-500/15"
                        >
                          Pay now
                        </Link>
                      ) : charge.status !== "PAID" &&
                        charge.status !== "VOID" &&
                        outstanding > 0 ? (
                        <div className="text-xs text-white/45">
                          Online payment link not ready yet.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Recent payments
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Payment history
          </h2>
        </div>

        <div className="divide-y divide-white/10">
          {team.paymentTransactions.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No payments recorded yet.
            </div>
          ) : (
            team.paymentTransactions.map((tx) => (
              <div key={tx.id} className="px-6 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-base font-semibold text-white">
                      {tx.charge?.title ?? "Unallocated payment"}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {tx.method.replaceAll("_", " ")}
                      {tx.reference ? ` · Ref ${tx.reference}` : ""}
                    </div>
                    <div className="mt-1 text-sm text-white/45">
                      {tx.paidAt.toLocaleString("en-GB")}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-base font-semibold text-white">
                      {formatMoney(tx.amountPence)}
                    </div>
                    {tx.notes ? (
                      <div className="mt-1 text-sm text-white/55">
                        {tx.notes}
                      </div>
                    ) : null}
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