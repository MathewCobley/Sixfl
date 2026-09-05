// ========================================
// File: src/app/captain/team/[teamid]/payments/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  applyAvailableTeamCreditToCharge,
  getTeamCreditLedger,
  type TeamCreditLedgerEntry,
} from "@/lib/payments/team-credits";
import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";
import {
  formatPaymentFixtureDate,
  formatPaymentMoney,
  getTeamPaymentLedger,
} from "@/lib/payments/team-payment-ledger";
import { getTeamSubscriptionSnapshot } from "@/lib/payments/team-subscriptions";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Captain Payments | SIXFL",
};

type PlayerFeePaymentInfo = {
  id: string;
  payerName: string;
  payerContact: string | null;
  fixtureLabel: string | null;
};

function formatMoney(amountPence: number) {
  return formatPaymentMoney(amountPence);
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

function formatSubscriptionStatus(status: string | null) {
  if (!status) return "Not set up";

  const labels: Record<string, string> = {
    active: "Active",
    trialing: "Trialling",
    past_due: "Past due",
    unpaid: "Unpaid",
    incomplete: "Setup incomplete",
    incomplete_expired: "Setup expired",
    canceled: "Cancelled",
    paused: "Paused",
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function getSubscriptionTone(status: string | null) {
  switch (status) {
    case "active":
    case "trialing":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "canceled":
    case "incomplete_expired":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.05] text-white/60";
  }
}

function isManagedByStripe(status: string | null) {
  return ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(
    status ?? "",
  );
}

function formatUkDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCreditEntryType(entryType: string) {
  if (entryType === "CREDIT_ADDED") return "Credit added";
  if (entryType === "CREDIT_USED") return "Credit used";
  if (entryType === "CREDIT_REVERSED") return "Credit reversed";
  return entryType.replaceAll("_", " ");
}

function getCreditEntrySignedAmount(entry: TeamCreditLedgerEntry) {
  return entry.entryType === "CREDIT_ADDED" ? entry.amountPence : -entry.amountPence;
}

function extractPlayerFeeId(notes: string | null) {
  const match = /Player fee ID:\s*([a-zA-Z0-9_-]+)/i.exec(notes ?? "");
  return match?.[1] ?? null;
}

function getPayerName(input: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string; lastName: string | null; email: string | null; phone: string | null } | null;
}) {
  if (input.teamMember) {
    return input.teamMember.user.name || input.teamMember.user.email || "Linked player";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName].filter(Boolean).join(" ").trim() ||
      input.prospect.email ||
      input.prospect.phone ||
      "Player prospect";
  }

  return "Player";
}

function getPayerContact(input: {
  teamMember: { user: { email: string | null } } | null;
  prospect: { email: string | null; phone: string | null } | null;
}) {
  if (input.teamMember) return input.teamMember.user.email;
  if (input.prospect) return [input.prospect.email, input.prospect.phone].filter(Boolean).join(" · ") || null;
  return null;
}

function formatPlayerPaymentNote(notes: string | null, playerFeeInfo: PlayerFeePaymentInfo | null) {
  if (playerFeeInfo) return "Player match fee paid online via Stripe Checkout.";
  return notes;
}

function getSubscriptionMessage(state?: string) {
  switch (state) {
    case "success":
      return "Automatic payment setup started. Stripe will confirm it here once the payment is complete.";
    case "cancelled":
      return "Automatic payment setup was cancelled.";
    case "active":
      return "Automatic payments are already active or being managed by Stripe.";
    case "missing_price":
      return "Automatic payments are not configured yet. Ask an admin to add the Stripe subscription price ID.";
    case "missing_customer":
      return "A Stripe customer has not been created for this team yet.";
    case "no_fixture":
      return "Automatic payments can be set up once this team has a published upcoming match-fee fixture.";
    default:
      return null;
  }
}

function getCreditMessage(state?: string, amount?: string) {
  switch (state) {
    case "used":
      return `Team credit used${amount ? `: ${formatMoney(Number(amount))}` : ""}.`;
    case "none":
      return "No available team credit could be used against that charge.";
    case "invalid":
      return "That credit could not be used against this charge.";
    default:
      return null;
  }
}

function getPaymentTransactionWhere(teamIds: string[], teamMode: string) {
  if (teamMode === "MANAGED") {
    return { teamId: { in: teamIds } };
  }

  return {
    teamId: { in: teamIds },
    NOT: {
      AND: [
        { chargeId: null },
        {
          notes: {
            contains: "Player match fee paid online",
          },
        },
      ],
    },
  };
}

async function useTeamCreditAction(formData: FormData) {
  "use server";

  const teamId = String(formData.get("teamId") ?? "").trim();
  const chargeId = String(formData.get("chargeId") ?? "").trim();

  if (!teamId || !chargeId) {
    redirect(teamId ? `/captain/team/${teamId}/payments?credit=invalid` : "/captain");
  }

  await requireCaptain(teamId);

  const ledger = await getTeamPaymentLedger(teamId);
  const entry = ledger?.entries.find((item) => item.chargeId === chargeId) ?? null;

  if (!ledger || !entry || entry.outstandingPence <= 0 || entry.displayStatus === "PAID" || entry.displayStatus === "VOID") {
    redirect(`/captain/team/${teamId}/payments?credit=invalid`);
  }

  let result: Awaited<ReturnType<typeof applyAvailableTeamCreditToCharge>>;

  try {
    result = await applyAvailableTeamCreditToCharge({
      chargeId,
      teamIds: ledger.relatedTeamIds,
      description: `Team credit used against ${entry.title}.`,
    });
  } catch {
    redirect(`/captain/team/${teamId}/payments?credit=invalid`);
  }

  revalidatePath(`/captain/team/${teamId}/payments`);
  revalidatePath(`/captain/team/${teamId}`);

  if (result.amountUsedPence <= 0) {
    redirect(`/captain/team/${teamId}/payments?credit=none`);
  }

  redirect(`/captain/team/${teamId}/payments?credit=used&amount=${result.amountUsedPence}`);
}

export default async function CaptainPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ subscription?: string; credit?: string; amount?: string }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  await requireCaptain(teamid);

  const [team, subscription, ledger] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, name: true, teamMode: true },
    }),
    getTeamSubscriptionSnapshot(teamid),
    getTeamPaymentLedger(teamid),
  ]);

  if (!team || !ledger) {
    notFound();
  }

  const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds);
  const creditBalancePence = Math.max(creditLedger.balancePence, 0);
  const recentCreditEntries = creditLedger.entries.slice(0, 6);

  const paymentTransactions = await prisma.paymentTransaction.findMany({
    where: getPaymentTransactionWhere(ledger.relatedTeamIds, team.teamMode),
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
  });

  const playerFeeIds = Array.from(
    new Set(
      paymentTransactions
        .map((transaction) => extractPlayerFeeId(transaction.notes))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const playerFeeRows = playerFeeIds.length
    ? await prisma.playerMatchFee.findMany({
        where: { id: { in: playerFeeIds } },
        select: {
          id: true,
          teamMember: {
            select: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          prospect: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          fixture: {
            select: {
              kickoffAt: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          },
        },
      })
    : [];

  const playerFeeInfoById = new Map<string, PlayerFeePaymentInfo>(
    playerFeeRows.map((fee) => [
      fee.id,
      {
        id: fee.id,
        payerName: getPayerName({ teamMember: fee.teamMember, prospect: fee.prospect }),
        payerContact: getPayerContact({ teamMember: fee.teamMember, prospect: fee.prospect }),
        fixtureLabel: fee.fixture
          ? `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name} · ${formatPaymentFixtureDate(fee.fixture.kickoffAt)}`
          : null,
      },
    ]),
  );

  const subscriptionMessage = getSubscriptionMessage(sp.subscription);
  const creditMessage = getCreditMessage(sp.credit, sp.amount);
  const canOpenPortal = Boolean(subscription?.stripeCustomerId);
  const subscriptionIsManaged = isManagedByStripe(subscription?.subscriptionStatus ?? null);

  return (
    <div className="space-y-8">
      {subscriptionMessage ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm text-white/70">
          {subscriptionMessage}
        </div>
      ) : null}

      {creditMessage ? (
        <div className={`rounded-2xl border px-5 py-4 text-sm ${sp.credit === "used" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-amber-400/20 bg-amber-500/10 text-amber-100"}`}>
          {creditMessage}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
            Due now
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatMoney(ledger.outstandingPence)}
          </p>
          <p className="mt-2 text-sm text-amber-100/75">
            Match fees are due on match day. Future fixture payment links are still available for teams who want to pay early.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Due charges
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {ledger.openChargeCount}
          </p>
          <p className="mt-2 text-sm text-white/60">
            Charges currently due for payment or part payment.
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Team credit
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {formatMoney(creditBalancePence)}
          </p>
          <p className="mt-2 text-sm text-emerald-100/75">
            Credit available to use against fixture charges.
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
            Payment history
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {paymentTransactions.length}
          </p>
          <p className="mt-2 text-sm text-emerald-100/75">
            Most recent recorded team and squad payments.
          </p>
        </div>
      </section>

      {creditLedger.entries.length > 0 ? (
        <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10">
          <div className="border-b border-emerald-400/10 px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Credits
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Team credit ledger
            </h2>
            <p className="mt-2 text-sm text-emerald-50/75">
              Credits are normally added when a postponed or abandoned fixture fee is carried forward. You can use available credit against a fixture charge below.
            </p>
          </div>
          <div className="divide-y divide-emerald-400/10">
            {recentCreditEntries.map((entry) => {
              const signedAmount = getCreditEntrySignedAmount(entry);
              return (
                <div key={entry.id} className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-white">{formatCreditEntryType(entry.entryType)}</div>
                    <div className="mt-1 text-sm text-emerald-50/70">{entry.description || entry.chargeTitle || "No note"}</div>
                    <div className="mt-1 text-xs text-emerald-50/45">{formatUkDateTime(entry.createdAt)}</div>
                  </div>
                  <div className={signedAmount >= 0 ? "font-semibold text-emerald-100" : "font-semibold text-red-100"}>
                    {signedAmount >= 0 ? "+" : "−"}{formatMoney(Math.abs(entry.amountPence))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-500/10">
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
              Automatic payments
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Recurring team payments
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-50/75">
              Set up a recurring Stripe payment for your team. Successful renewal payments will be recorded automatically in the SIXFL payment history.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={[
                  "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                  getSubscriptionTone(subscription?.subscriptionStatus ?? null),
                ].join(" ")}
              >
                {formatSubscriptionStatus(subscription?.subscriptionStatus ?? null)}
              </span>

              {subscription?.subscriptionCurrentPeriodEnd ? (
                <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  Next renewal {formatUkDate(subscription.subscriptionCurrentPeriodEnd)}
                </span>
              ) : null}

              {subscription?.subscriptionLastPaymentAt ? (
                <span className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  Last paid {formatUkDate(subscription.subscriptionLastPaymentAt)}
                </span>
              ) : null}

              {subscription?.subscriptionLastPaymentFailedAt ? (
                <span className="inline-flex rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100">
                  Last failed {formatUkDate(subscription.subscriptionLastPaymentFailedAt)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <form action={`/captain/team/${team.id}/payments/start-subscription`} method="post">
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-300 px-5 text-sm font-semibold text-black transition hover:bg-emerald-200 sm:w-auto"
              >
                {subscriptionIsManaged ? "Replace automatic payment" : "Set up automatic payments"}
              </button>
            </form>

            {canOpenPortal ? (
              <form action={`/captain/team/${team.id}/payments/manage-subscription`} method="post">
                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-5 text-sm font-semibold text-white transition hover:bg-black/30 sm:w-auto"
                >
                  Manage in Stripe
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Charges
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Team payment ledger
          </h2>
        </div>

        <div className="divide-y divide-white/10">
          {ledger.entries.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No charges recorded yet.
            </div>
          ) : (
            ledger.entries.map((entry) => {
              const isDueNow = isMatchFeeChargePayable(entry.dueDate);
              const canPayOnline =
                Boolean(entry.paymentToken) &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                entry.outstandingPence > 0;
              const canUseCredit =
                creditBalancePence > 0 &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                entry.outstandingPence > 0;
              const context = [entry.leagueName, entry.leagueSeason, entry.divisionName]
                .filter(Boolean)
                .join(" · ");

              return (
                <div key={entry.chargeId} className="px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-white">
                          {entry.title}
                        </div>

                        {entry.fixtureId ? (
                          <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100/75">
                            Fixture charge
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-white/55">
                        {entry.description || "No description"}
                      </div>

                      <div className="mt-2 text-sm text-emerald-100/75">
                        {entry.fixtureLabel}
                      </div>

                      {context ? (
                        <div className="mt-1 text-sm text-white/45">{context}</div>
                      ) : null}

                      <div className="mt-1 text-sm text-white/45">
                        {entry.dueDate
                          ? `Due ${formatPaymentFixtureDate(entry.dueDate)}`
                          : entry.kickoffAt
                            ? `Fixture ${formatPaymentFixtureDate(entry.kickoffAt)}`
                            : "No due date set"}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 lg:items-end">
                      <div className="text-right">
                        <div className="text-base font-semibold text-white">
                          {formatMoney(entry.amountPence)}
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          Paid {formatMoney(entry.paidPence)} · Outstanding {" "}
                          {formatMoney(entry.outstandingPence)}
                        </div>
                        {entry.playerPaidPence > 0 || entry.playerOpenPence > 0 ? (
                          <div className="mt-1 text-xs text-white/45">
                            Squad paid {formatMoney(entry.playerPaidPence)} · player links open {formatMoney(entry.playerOpenPence)}
                          </div>
                        ) : null}
                        {entry.overpaidPence > 0 ? (
                          <div className="mt-1 text-xs text-emerald-200">
                            Team credit generated: {formatMoney(entry.overpaidPence)}
                          </div>
                        ) : null}
                        <div className="mt-2">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                              getChargeStatusTone(entry.displayStatus),
                            ].join(" ")}
                          >
                            {formatChargeStatus(entry.displayStatus)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 lg:items-end">
                        {canUseCredit ? (
                          <form action={useTeamCreditAction}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="chargeId" value={entry.chargeId} />
                            <button
                              type="submit"
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15"
                            >
                              Use team credit
                            </button>
                          </form>
                        ) : null}

                        {canPayOnline ? (
                          <div className="flex flex-col gap-1 lg:items-end">
                            <Link
                              href={`/pay/charge/${entry.paymentToken}`}
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-500/15"
                            >
                              Pay now
                            </Link>
                            {!isDueNow ? (
                              <div className="text-xs text-white/45">
                                Optional early payment — due on match day.
                              </div>
                            ) : null}
                          </div>
                        ) : entry.displayStatus !== "PAID" &&
                          entry.displayStatus !== "VOID" &&
                          entry.outstandingPence > 0 ? (
                          <div className="text-xs text-white/45">
                            Online payment link not ready yet.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Recent payments
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Payment history
          </h2>
          <p className="mt-2 text-sm text-white/55">
            Recent team payments and squad payments, including who paid where we can match the player fee.
          </p>
        </div>

        <div className="divide-y divide-white/10">
          {paymentTransactions.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No payments recorded yet.
            </div>
          ) : (
            paymentTransactions.map((tx) => {
              const playerFeeId = extractPlayerFeeId(tx.notes);
              const playerFeeInfo = playerFeeId ? playerFeeInfoById.get(playerFeeId) ?? null : null;
              const paymentNote = formatPlayerPaymentNote(tx.notes, playerFeeInfo);

              return (
                <div key={tx.id} className="px-6 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-base font-semibold text-white">
                        {tx.charge?.title ?? "Unallocated payment"}
                      </div>

                      {playerFeeInfo ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                            Paid by {playerFeeInfo.payerName}
                          </span>
                          {playerFeeInfo.payerContact ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                              {playerFeeInfo.payerContact}
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-2 text-sm text-white/55">
                        {tx.method.replaceAll("_", " ")}
                        {tx.reference ? ` · Ref ${tx.reference}` : ""}
                      </div>

                      {playerFeeInfo?.fixtureLabel ? (
                        <div className="mt-1 text-sm text-emerald-100/70">
                          {playerFeeInfo.fixtureLabel}
                        </div>
                      ) : null}

                      <div className="mt-1 text-sm text-white/45">
                        {formatUkDateTime(tx.paidAt)}
                      </div>
                    </div>

                    <div className="text-left lg:text-right">
                      <div className="text-base font-semibold text-white">
                        {formatMoney(tx.amountPence)}
                      </div>
                      {paymentNote ? (
                        <div className="mt-1 max-w-2xl text-sm text-white/55">
                          {paymentNote}
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
    </div>
  );
}
