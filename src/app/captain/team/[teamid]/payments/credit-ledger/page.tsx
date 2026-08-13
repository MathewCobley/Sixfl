import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getTeamCreditLedger } from "@/lib/payments/team-credits";
import { formatPaymentMoney, getTeamPaymentLedger } from "@/lib/payments/team-payment-ledger";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Team Credit Ledger | SIXFL",
};

function signedAmount(entryType: string, amountPence: number) {
  return entryType === "CREDIT_ADDED" ? amountPence : -amountPence;
}

function entryLabel(entryType: string) {
  if (entryType === "CREDIT_ADDED") return "Credit added";
  if (entryType === "CREDIT_USED") return "Credit used";
  if (entryType === "CREDIT_REVERSED") return "Credit reversed";
  return entryType.replaceAll("_", " ");
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TeamCreditLedgerPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const [team, paymentLedger] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, name: true },
    }),
    getTeamPaymentLedger(teamid),
  ]);

  if (!team || !paymentLedger) notFound();

  const creditLedger = await getTeamCreditLedger(paymentLedger.relatedTeamIds);
  const chronological = [...creditLedger.entries].sort((a, b) => {
    const dateDifference = a.createdAt.getTime() - b.createdAt.getTime();
    return dateDifference || a.id.localeCompare(b.id);
  });

  let balancePence = 0;
  const balanceAfterEntry = new Map<string, number>();
  for (const entry of chronological) {
    balancePence += signedAmount(entry.entryType, entry.amountPence);
    balanceAfterEntry.set(entry.id, balancePence);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/60">
            Team finances
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Team credit ledger</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            A clear audit trail of credit added to {team.name}, credit used against fixture charges, and the balance after each movement.
          </p>
        </div>
        <Link
          href={`/captain/team/${teamid}/payments`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
        >
          Back to payments
        </Link>
      </div>

      <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
          Current team credit
        </p>
        <p className="mt-3 text-4xl font-semibold text-white">
          {formatPaymentMoney(Math.max(creditLedger.balancePence, 0))}
        </p>
        <p className="mt-2 text-sm text-emerald-50/70">
          This is money already held by SIXFL for the team and available to use against eligible fixture charges.
        </p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/20">
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <h2 className="text-xl font-semibold text-white">Credit movements</h2>
          <p className="mt-1 text-sm text-white/50">
            Newest first. Every row shows the resulting credit balance after that movement.
          </p>
        </div>

        {creditLedger.entries.length === 0 ? (
          <div className="px-6 py-8 text-sm text-white/50">
            No team credit movements have been recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {creditLedger.entries.map((entry) => {
              const amount = signedAmount(entry.entryType, entry.amountPence);
              const balanceAfter = balanceAfterEntry.get(entry.id) ?? 0;

              return (
                <article
                  key={entry.id}
                  className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_150px_170px] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{entryLabel(entry.entryType)}</span>
                      {entry.chargeTitle ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                          {entry.chargeTitle}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-5 text-white/65">
                      {entry.description || "No additional note recorded."}
                    </p>
                    <p className="mt-2 text-xs text-white/40">{formatDate(entry.createdAt)}</p>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Movement
                    </p>
                    <p className={amount >= 0 ? "mt-1 text-lg font-semibold text-emerald-200" : "mt-1 text-lg font-semibold text-amber-100"}>
                      {amount >= 0 ? "+" : "−"}{formatPaymentMoney(Math.abs(amount))}
                    </p>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                      Balance after
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {formatPaymentMoney(Math.max(balanceAfter, 0))}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {creditLedger.entries.length >= 100 ? (
        <p className="text-xs text-white/35">
          Showing the 100 most recent credit movements.
        </p>
      ) : null}
    </div>
  );
}
