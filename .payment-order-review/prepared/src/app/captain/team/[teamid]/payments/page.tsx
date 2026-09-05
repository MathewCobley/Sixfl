// ========================================
// File: src/app/captain/team/[teamid]/payments/page.tsx
// ========================================

import Link from "next/link";
import TeamKitFundTransferPanel from "@/components/captain/TeamKitFundTransferPanel";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getKitFundLedger } from "@/lib/kits/kit-fund";
import {
  applyAvailableTeamCreditToCharge,
  getTeamCreditLedger,
  type TeamCreditLedgerEntry,
} from "@/lib/payments/team-credits";
import { isMatchFeeChargePayable } from "@/lib/payments/match-day-billing";
import { hydrateCaptainAssignedPlayerFees } from "@/lib/payments/player-fee-assigned-share";
import { reconcileZeroFeePlayerAdjustmentsForTeam } from "@/lib/payments/zero-fee-player-adjustments";
import {
  formatPaymentFixtureDate,
  formatPaymentMoney,
  getTeamPaymentLedger,
} from "@/lib/payments/team-payment-ledger";
import { getTeamSubscriptionSnapshot } from "@/lib/payments/team-subscriptions";
import {
  getTeamAutoPaySnapshot,
  isConfirmedTeamAutoPaySetup,
  reconcileTeamAutoPaySetup,
} from "@/lib/payments/team-autopay-snapshot";
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

function formatChargeStatus(status: string, waivedPence = 0) {
  if (status === "PAID" && waivedPence > 0) return "Settled";

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
      return "Saved card setup returned from Stripe.";
    case "cancelled":
      return "Saved card setup was cancelled. No automatic matchday card payment has been enabled.";
    case "active":
      return "A saved Stripe payment method is already linked to this team.";
    case "missing_price":
      return "Saved-card matchday payments are not configured for this team yet.";
    case "missing_customer":
      return "A Stripe customer has not been created for this team yet.";
    case "no_fixture":
      return "A saved card can be set up once this team has a published upcoming match-fee fixture.";
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

async function closeSettledChargePlayerLinksAction(formData: FormData) {
  "use server";

  const teamId = String(formData.get("teamId") ?? "").trim();
  const chargeId = String(formData.get("chargeId") ?? "").trim();

  if (!teamId || !chargeId) {
    redirect(teamId ? `/captain/team/${teamId}/payments?links=invalid` : "/captain");
  }

  await requireCaptain(teamId);
  const ledger = await getTeamPaymentLedger(teamId);
  const entry = ledger?.entries.find((item) => item.chargeId === chargeId) ?? null;

  if (
    !ledger ||
    !entry ||
    !entry.fixtureId ||
    entry.playerOpenPence <= 0
  ) {
    redirect(`/captain/team/${teamId}/payments?links=invalid`);
  }

  await prisma.playerMatchFee.updateMany({
    where: {
      teamId: { in: ledger.relatedTeamIds },
      fixtureId: entry.fixtureId,
      status: "OPEN",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      paymentUrl: null,
      paymentToken: null,
      note: "Cancelled by captain from team payments. Existing completed player payments were preserved.",
    },
  });

  revalidatePath(`/captain/team/${teamId}/payments`);
  revalidatePath(`/captain/team/${teamId}/match-fees`);
  redirect(`/captain/team/${teamId}/payments?links=closed`);
}

export default async function CaptainPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ autopay?: string; subscription?: string; credit?: string; amount?: string; links?: string  }>;
}) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  await requireCaptain(teamid);
  await reconcileZeroFeePlayerAdjustmentsForTeam(teamid);

  if (sp.autopay === "success") {
    await reconcileTeamAutoPaySetup(teamid);
  }

  const [team, subscription, autoPay, ledger] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamid },
      select: { id: true, name: true, teamMode: true },
    }),
    getTeamSubscriptionSnapshot(teamid),
    getTeamAutoPaySnapshot(teamid),
    getTeamPaymentLedger(teamid),
  ]);

  if (!team || !ledger) {
    notFound();
  }

  const creditLedger = await getTeamCreditLedger(ledger.relatedTeamIds);
  const kitFundLedger = await getKitFundLedger(teamid);
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

  const fixtureIdsWithLedgerCharges = Array.from(
    new Set(
      ledger.entries
        .map((entry) => entry.fixtureId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const playerCollectionRows = fixtureIdsWithLedgerCharges.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: { in: ledger.relatedTeamIds },
          fixtureId: { in: fixtureIdsWithLedgerCharges },
          status: { in: ["OPEN", "PAID", "WAIVED"] },
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          teamId: true,
          fixtureId: true,
          amountPence: true,
          status: true,
          paidAt: true,
          waivedAt: true,
          note: true,
          paymentUrl: true,
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
        },
      })
    : [];
  const playerCollectionRowsWithAssignedShares =
    await hydrateCaptainAssignedPlayerFees(playerCollectionRows);

  const playerCollectionsByTeamFixture = new Map<
    string,
    Array<{
      id: string;
      name: string;
      contact: string | null;
      amountPence: number;
      statusLabel: string;
      statusMeta: string;
      tone: string;
    }>
  >();

  for (const fee of playerCollectionRowsWithAssignedShares) {
    const key = fee.teamId + ":" + fee.fixtureId;
    const rows = playerCollectionsByTeamFixture.get(key) ?? [];
    const paidToCaptain =
      fee.status === "WAIVED" &&
      Boolean(fee.note?.includes("captain/organiser marked"));
    const hiddenZeroFeeSettlement =
      fee.status === "WAIVED" &&
      Boolean(fee.note?.includes("Zero-fee player share waived by SIXFL"));
    const capMatch =
      /Player fee cap applied: captain share £([0-9,.]+); player charged £([0-9,.]+)./i.exec(
        fee.note ?? "",
      );
    const captainSharePence =
      typeof fee.captainAssignedAmountPence === "number"
        ? fee.captainAssignedAmountPence
        : capMatch
          ? Math.round(Number(capMatch[1].replace(/,/g, "")) * 100)
          : fee.amountPence;
    const displayAmountPence =
      Number.isFinite(captainSharePence) && captainSharePence >= 0
        ? captainSharePence
        : fee.amountPence;
    const statusLabel =
      hiddenZeroFeeSettlement
        ? "Settled"
        : fee.status === "PAID"
          ? "Paid online"
          : fee.status === "OPEN"
            ? "Awaiting payment"
            : paidToCaptain
              ? "Paid to captain"
              : fee.amountPence === 0
                ? "No charge"
                : "No payment needed";
    const statusMeta =
      hiddenZeroFeeSettlement && fee.waivedAt
        ? "Settled " + formatUkDateTime(fee.waivedAt)
        : fee.status === "PAID" && fee.paidAt
          ? "Paid " + formatUkDateTime(fee.paidAt)
          : paidToCaptain && fee.waivedAt
            ? "Recorded " + formatUkDateTime(fee.waivedAt)
            : fee.status === "OPEN"
              ? fee.paymentUrl
                ? "Payment link open"
                : "Awaiting payment link"
              : fee.waivedAt
                ? "Recorded " + formatUkDateTime(fee.waivedAt)
                : "Recorded in player collection";
    const tone =
      fee.status === "PAID" || paidToCaptain || hiddenZeroFeeSettlement
        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
        : fee.status === "OPEN"
          ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
          : "border-white/10 bg-white/[0.04] text-white/55";

    rows.push({
      id: fee.id,
      name: getPayerName({ teamMember: fee.teamMember, prospect: fee.prospect }),
      contact: getPayerContact({ teamMember: fee.teamMember, prospect: fee.prospect }),
      amountPence: displayAmountPence,
      statusLabel,
      statusMeta,
      tone,
    });
    playerCollectionsByTeamFixture.set(key, rows);
  }

  const fixtureIdsWithCharges = ledger.entries
    .map((entry) => entry.fixtureId)
    .filter((value): value is string => Boolean(value));
  const openPlayerFeeRows = fixtureIdsWithCharges.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: { in: ledger.relatedTeamIds },
          fixtureId: { in: fixtureIdsWithCharges },
          status: "OPEN",
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          fixtureId: true,
          amountPence: true,
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
        },
      })
    : [];
  const openPlayerFeesByFixtureId = new Map<
    string,
    Array<{
      id: string;
      name: string;
      contact: string | null;
      amountPence: number;
    }>
  >();

  for (const fee of openPlayerFeeRows) {
    const existing = openPlayerFeesByFixtureId.get(fee.fixtureId) ?? [];
    existing.push({
      id: fee.id,
      name: getPayerName({ teamMember: fee.teamMember, prospect: fee.prospect }),
      contact: getPayerContact({ teamMember: fee.teamMember, prospect: fee.prospect }),
      amountPence: fee.amountPence,
    });
    openPlayerFeesByFixtureId.set(fee.fixtureId, existing);
  }

  const hasSavedCard = isConfirmedTeamAutoPaySetup(autoPay);
  const hasStripeCustomer = Boolean(autoPay?.stripeCustomerId);
  const subscriptionMessage =
    sp.autopay === "success"
      ? hasSavedCard
        ? "Saved card setup complete. Your card is authorised for automatic one-off matchday team payments."
        : "Stripe returned you to SIXFL, but a complete saved-card mandate has not been confirmed yet. Use Continue saved card setup below to finish."
      : sp.autopay === "incomplete"
        ? "Saved card setup is incomplete. Continue the setup to enter and confirm the card details."
        : getSubscriptionMessage(sp.autopay ?? sp.subscription);
  const creditMessage = getCreditMessage(sp.credit, sp.amount);
  const canOpenPortal = hasSavedCard;

  return (
    <div className="space-y-8">
      {subscriptionMessage ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm text-white/70">
          {subscriptionMessage}
        </div>
      ) : null}

      {sp.links === "closed" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
          Remaining unpaid player links were closed. No further player payment can be taken for that fixture.
        </div>
      ) : sp.links === "invalid" ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
          Those player links could not be changed. Refresh the page and check that unpaid player links are still open for this fixture.
        </div>
      ) : null}

      {creditMessage ? (
        <div className={`rounded-2xl border px-5 py-4 text-sm ${sp.credit === "used" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-amber-400/20 bg-amber-500/10 text-amber-100"}`}>
          {creditMessage}
        </div>
      ) : null}

      {creditBalancePence > 0 ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 py-4 text-sm leading-6 text-emerald-50/85">
          <span className="font-semibold text-white">
            Your team has {formatMoney(creditBalancePence)} available credit.
          </span>{" "}
          SIXFL uses team credit against the next fixture fee before taking another card payment. Team credit is capped at one normal match fee.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            Used against the next fixture before another payment is taken. Credit is capped at one normal match fee.
          </p>
        </div>

        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">Kit fund</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatMoney(Math.max(kitFundLedger.balancePence, 0))}</p>
          <p className="mt-2 text-sm text-sky-100/75">Reserved for SIXFL kits only.</p>
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

      <TeamKitFundTransferPanel
        teamId={team.id}
        teamCreditPence={Math.max(creditLedger.balancePence, 0)}
        kitFundBalancePence={Math.max(kitFundLedger.balancePence, 0)}
        entries={kitFundLedger.entries.slice(0, 8).map((entry) => ({
          id: entry.id,
          entryType: entry.entryType,
          amountPence: entry.amountPence,
          description: entry.description,
          createdAtIso: entry.createdAt.toISOString(),
        }))}
      />

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
              Saved card payments
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Saved card matchday payments
            </h2>
            <p className="mt-2 text-sm leading-6 text-emerald-50/75">
              Save a team card securely with Stripe. SIXFL only takes a one-off outstanding match fee on the actual fixture day. Player payments and team credit reduce that amount first, and postponed or cancelled fixtures are not charged.
            </p>

            {hasStripeCustomer && !hasSavedCard ? (
              <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                Stripe has created the team payment account, but a complete saved-card mandate is not recorded. Continue the saved-card setup to enter and confirm the card details.
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={[
                  "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                  hasSavedCard
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                    : hasStripeCustomer
                      ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
                      : "border-white/10 bg-white/[0.05] text-white/60",
                ].join(" ")}
              >
                {hasSavedCard ? "Saved card setup complete" : hasStripeCustomer ? "Card setup incomplete" : "Not set up"}
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
            <form action={`/captain/team/${team.id}/payments/setup-saved-card`} method="post">
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-300 px-5 text-sm font-semibold text-black transition hover:bg-emerald-200 sm:w-auto"
              >
                {hasSavedCard ? "Replace saved card" : hasStripeCustomer ? "Continue saved card setup" : "Set up saved card"}
              </button>
            </form>

            {hasSavedCard ? (
              <form action={`/captain/team/${team.id}/payments/manage-saved-card`} method="post">
                <button
                  type="submit"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-5 text-sm font-semibold text-white transition hover:bg-black/30 sm:w-auto"
                >
                  Manage saved card
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
              const creditAvailableForChargePence = Math.min(
                creditBalancePence,
                entry.outstandingPence,
              );
              const payableAfterCreditPence = Math.max(
                entry.outstandingPence - creditAvailableForChargePence,
                0,
              );
              const canPayOnline =
                Boolean(entry.paymentToken) &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                payableAfterCreditPence > 0;
              const canUseCredit =
                creditAvailableForChargePence > 0 &&
                entry.displayStatus !== "PAID" &&
                entry.displayStatus !== "VOID" &&
                entry.outstandingPence > 0;
              const context = [entry.leagueName, entry.leagueSeason, entry.divisionName]
                .filter(Boolean)
                .join(" · ");
              const unpaidPlayers = entry.fixtureId
                ? openPlayerFeesByFixtureId.get(entry.fixtureId) ?? []
                : [];
              const playerCollectionDetails = entry.fixtureId
                ? playerCollectionsByTeamFixture.get(entry.teamId + ":" + entry.fixtureId) ?? []
                : [];
              const nonPlayerChargePayments = entry.payments.filter((payment) => {
                const notes = (payment.notes ?? "").toLowerCase();
                return (
                  !notes.includes("player match fee paid online") &&
                  !notes.includes("player fee id:")
                );
              });
              const teamCreditUsedPence = nonPlayerChargePayments
                .filter((payment) => {
                  const notes = (payment.notes ?? "").toLowerCase();
                  return (
                    payment.reference === "TEAM_CREDIT" ||
                    notes.includes("team credit used")
                  );
                })
                .reduce((sum, payment) => sum + payment.amountPence, 0);
              const teamPaymentPence = Math.max(
                entry.directPaidPence - teamCreditUsedPence,
                0,
              );
              const playerSettledPence =
                entry.playerPaidPence + entry.playerSubsidyPence;
              const playerLinksOpenPence = Math.max(
                entry.playerOpenPence,
                playerCollectionDetails
                  .filter((payment) => payment.statusLabel === "Awaiting payment")
                  .reduce((sum, payment) => sum + payment.amountPence, 0),
              );
              const totalAppliedPence = Math.min(
                entry.settledPence,
                entry.amountPence,
              );
              const isKitCharge = entry.title
                .trim()
                .toLowerCase()
                .startsWith("additional kit contribution");

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

                      {entry.latePaymentFeeStatus === "APPLIED" && entry.latePaymentFeeAmountPence > 0 ? (
                        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100/85">
                          <span className="font-semibold text-red-100">Late-payment admin fee applied:</span>{" "}
                          base charge {formatMoney(entry.baseMatchFeePence)} + {formatMoney(entry.latePaymentFeeAmountPence)} admin fee = {formatMoney(entry.amountPence)} total.
                        </div>
                      ) : null}

                      <div className="mt-2 text-sm text-emerald-100/75">
                        {entry.fixtureLabel}
                      </div>

                      {context ? (
                        <div className="mt-1 text-sm text-white/45">{context}</div>
                      ) : null}

                      <div className="mt-1 text-sm text-white/45">
                        {entry.dueDate
                          ? "Due " + formatPaymentFixtureDate(entry.dueDate)
                          : entry.kickoffAt
                            ? "Fixture " + formatPaymentFixtureDate(entry.kickoffAt)
                            : "No due date set"}
                      </div>

                      {playerCollectionDetails.length > 0 ? (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20 text-left">
                          <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                            Player payment details
                          </div>
                          <div className="divide-y divide-white/10">
                            {playerCollectionDetails.map((payment) => (
                              <div
                                key={payment.id}
                                className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-white">{payment.name}</div>
                                  {payment.contact ? (
                                    <div className="mt-0.5 break-all text-xs text-white/45">
                                      {payment.contact}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                                  <div className="text-right">
                                    <div className="font-semibold text-white">
                                      {formatMoney(payment.amountPence)}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-white/40">
                                      {payment.statusMeta}
                                    </div>
                                  </div>
                                  <span
                                    className={[
                                      "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                                      payment.tone,
                                    ].join(" ")}
                                  >
                                    {payment.statusLabel}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : entry.playerPaidPence > 0 || entry.playerOpenPence > 0 ? (
                        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
                          Player payment totals exist, but the individual records could not be matched to this fixture charge.
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-3 lg:items-end">
                      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-sm font-semibold text-white">
                            {isKitCharge
                              ? "Kit charge"
                              : entry.fixtureId
                                ? "Fixture charge"
                                : "Charge"}
                          </span>
                          <span className="text-lg font-semibold text-white">
                            {formatMoney(entry.amountPence)}
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-sm text-white/65">
                          {!isKitCharge ? (
                            <div className="flex items-center justify-between gap-4">
                              <span>Player shares settled</span>
                              <span className="font-semibold text-white">
                                {formatMoney(playerSettledPence)}
                              </span>
                            </div>
                          ) : null}
                          <div className="flex items-center justify-between gap-4">
                            <span>{isKitCharge ? "Paid" : "Team paid"}</span>
                            <span className="font-semibold text-white">
                              {formatMoney(teamPaymentPence)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span>{isKitCharge ? "Credit used" : "Team credit used"}</span>
                            <span className="font-semibold text-white">
                              {formatMoney(teamCreditUsedPence)}
                            </span>
                          </div>
                          {entry.waivedPence > 0 ? (
                            <div className="flex items-center justify-between gap-4">
                              <span>SIXFL waiver</span>
                              <span className="font-semibold text-sky-100">
                                {formatMoney(entry.waivedPence)}
                              </span>
                            </div>
                          ) : null}
                          {creditAvailableForChargePence > 0 ? (
                            <div className="flex items-center justify-between gap-4 text-emerald-100">
                              <span>Available team credit</span>
                              <span className="font-semibold">
                                {formatMoney(creditAvailableForChargePence)}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-3 border-t border-white/10 pt-3">
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="font-semibold text-white">
                              {isKitCharge
                                ? "Total applied to kit"
                                : entry.fixtureId
                                  ? "Total applied to fixture"
                                  : "Total applied"}
                            </span>
                            <span className="font-semibold text-emerald-100">
                              {formatMoney(totalAppliedPence)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                            <span className="text-white/60">Outstanding</span>
                            <span
                              className={
                                entry.outstandingPence > 0
                                  ? "font-semibold text-amber-100"
                                  : "font-semibold text-emerald-100"
                              }
                            >
                              {formatMoney(entry.outstandingPence)}
                            </span>
                          </div>
                          {creditAvailableForChargePence > 0 ? (
                            <div className="mt-2 flex items-center justify-between gap-4 border-t border-emerald-400/10 pt-2 text-sm">
                              <span className="font-semibold text-emerald-100">
                                Remaining after available credit
                              </span>
                              <span className="font-semibold text-emerald-100">
                                {formatMoney(payableAfterCreditPence)}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {playerLinksOpenPence > 0 ? (
                          <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-4 text-sm text-amber-100">
                              <span className="font-semibold">Player links still open</span>
                              <span className="font-semibold">
                                {formatMoney(playerLinksOpenPence)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-amber-50/70">
                              These unpaid links are already included in the outstanding fixture balance above. Each payment will reduce that balance; only money collected after the fixture is fully covered becomes team credit.
                            </p>
                            <form action={closeSettledChargePlayerLinksAction} className="mt-3">
                              <input type="hidden" name="teamId" value={team.id} />
                              <input type="hidden" name="chargeId" value={entry.chargeId} />
                              <button
                                type="submit"
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-500/25"
                              >
                                Cancel all unpaid player links
                              </button>
                            </form>
                          </div>
                        ) : null}

                        {entry.overpaidPence > 0 ? (
                          <div className="mt-3 text-xs text-emerald-200">
                            Team credit generated: {formatMoney(entry.overpaidPence)}
                          </div>
                        ) : null}

                        {nonPlayerChargePayments.length > 0 ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                              {isKitCharge
                                ? "Kit payment details"
                                : entry.fixtureId
                                  ? "Team payment and credit details"
                                  : "Payment details"}
                            </div>
                            <div className="mt-2 space-y-2">
                              {nonPlayerChargePayments.map((payment) => {
                                const notes = (payment.notes ?? "").toLowerCase();
                                const isTeamCredit =
                                  payment.reference === "TEAM_CREDIT" ||
                                  notes.includes("team credit used");

                                return (
                                  <div
                                    key={payment.id}
                                    className="flex items-start justify-between gap-4 text-xs leading-5"
                                  >
                                    <div>
                                      <div className="font-semibold text-white">
                                        {isTeamCredit
                                          ? isKitCharge
                                            ? "Credit used"
                                            : "Team credit used"
                                          : isKitCharge
                                            ? "Kit payment"
                                            : "Team payment"}
                                      </div>
                                      <div className="text-white/40">
                                        {isTeamCredit
                                          ? "Applied from the team credit balance"
                                          : payment.method.replaceAll("_", " ") +
                                            " · " +
                                            formatUkDateTime(payment.paidAt)}
                                      </div>
                                    </div>
                                    <span className="shrink-0 font-semibold text-white">
                                      {formatMoney(payment.amountPence)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <span
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                              getChargeStatusTone(entry.displayStatus),
                            ].join(" ")}
                          >
                            {formatChargeStatus(entry.displayStatus, entry.waivedPence)}
                          </span>
                        </div>
                      </div>

                      {entry.displayStatus === "PAID" && playerLinksOpenPence > 0 ? (
                        <div className="w-full max-w-xl rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-left">
                          <div className="font-semibold text-amber-100">
                            Fixture paid — these player links are extra
                          </div>
                          <p className="mt-2 text-sm leading-6 text-amber-50/80">
                            The fixture charge is already fully covered. The remaining {formatMoney(playerLinksOpenPence)} is still available to collect from players, but it is not owed to SIXFL for this fixture.
                          </p>

                          <div className="mt-3 rounded-xl border border-amber-300/20 bg-black/20 px-3 py-2 text-sm text-amber-50/85">
                            {formatMoney(playerSettledPence)} player shares + {formatMoney(teamPaymentPence)} team payment + {formatMoney(teamCreditUsedPence)} team credit + {formatMoney(entry.waivedPence)} SIXFL waiver = {formatMoney(totalAppliedPence)} settled.
                          </div>

                          {unpaidPlayers.length > 0 ? (
                            <div className="mt-3 overflow-hidden rounded-xl border border-amber-300/20 bg-black/20">
                              <div className="border-b border-amber-300/15 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/70">
                                Links still awaiting payment
                              </div>
                              <div className="divide-y divide-white/10">
                                {unpaidPlayers.map((player) => (
                                  <div
                                    key={player.id}
                                    className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                                  >
                                    <div className="min-w-0">
                                      <div className="font-semibold text-white">{player.name}</div>
                                      {player.contact ? (
                                        <div className="mt-0.5 break-all text-xs text-white/50">
                                          {player.contact}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="shrink-0 font-semibold text-amber-100">
                                      {formatMoney(player.amountPence)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <p className="mt-3 text-xs leading-5 text-amber-50/65">
                            Any payment received from these links will be added to the team credit balance.
                          </p>

                          <p className="mt-3 text-xs text-white/55">
                            Use the cancellation button in the player-links summary above if you do not want these links to remain payable.
                          </p>
                        </div>
                      ) : null}

                      <div className="flex w-full max-w-xl flex-col gap-2 lg:items-end">
                        {creditAvailableForChargePence > 0 ? (
                          <div className="w-full rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-left">
                            <div className="text-sm font-semibold text-emerald-50">
                              {payableAfterCreditPence === 0
                                ? "Your available team credit covers this fee in full."
                                : `Use ${formatMoney(creditAvailableForChargePence)} team credit first`}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-emerald-50/70">
                              {payableAfterCreditPence === 0
                                ? `Apply ${formatMoney(creditAvailableForChargePence)} credit and there will be £0.00 left to pay by card.`
                                : `After credit, ${formatMoney(payableAfterCreditPence)} remains to pay. If you choose Pay now, SIXFL applies the credit first and Stripe only collects the remainder.`}
                            </p>
                          </div>
                        ) : null}

                        {canUseCredit ? (
                          <form action={useTeamCreditAction}>
                            <input type="hidden" name="teamId" value={team.id} />
                            <input type="hidden" name="chargeId" value={entry.chargeId} />
                            <button
                              type="submit"
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15"
                            >
                              Use {formatMoney(creditAvailableForChargePence)} credit
                            </button>
                          </form>
                        ) : null}

                        {canPayOnline ? (
                          <div className="flex flex-col gap-1 lg:items-end">
                            <Link
                              href={`/pay/charge/${entry.paymentToken}`}
                              className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/30 hover:bg-emerald-500/15"
                            >
                              {creditAvailableForChargePence > 0
                                ? `Pay ${formatMoney(payableAfterCreditPence)} after credit`
                                : "Pay now"}
                            </Link>
                            {creditAvailableForChargePence > 0 ? (
                              <div className="text-xs text-emerald-100/60">
                                Team credit is applied before Stripe takes the remaining payment.
                              </div>
                            ) : !isDueNow ? (
                              <div className="text-xs text-white/45">
                                Optional early payment — due on match day.
                              </div>
                            ) : null}
                          </div>
                        ) : entry.displayStatus !== "PAID" &&
                          entry.displayStatus !== "VOID" &&
                          entry.outstandingPence > 0 &&
                          payableAfterCreditPence > 0 ? (
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
