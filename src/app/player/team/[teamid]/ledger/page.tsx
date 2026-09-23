import Link from "next/link";
import { getPlayerPaymentLinkSettlementLabel } from "@/lib/payments/player-payment-display";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/auth";
import PlayerAppPayments, {
  type PlayerAppPaymentActivity,
  type PlayerAppPaymentFee,
  type PlayerAppPaymentLinkHistory,
  type PlayerAppPaymentPlan,
} from "@/components/player/PlayerAppPayments";
import PlayerPwaModeOnly from "@/components/player/PlayerPwaModeOnly";
import PlayerLedgerStatement from "@/components/payments/PlayerLedgerStatement";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getPlayerLedgerAccount,
  getPlayerLedgerSummaryForUser,
  money,
  repaymentAmount,
} from "@/lib/payments/player-ledger";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Player Payments | SIXFL" };

type PageProps = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ previewMembershipId?: string }>;
};

function withPreview(href: string, previewMembershipId: string | null) {
  if (!previewMembershipId) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}previewMembershipId=${encodeURIComponent(previewMembershipId)}`;
}

function entryTitle(kind: string) {
  if (kind === "OPENING_BALANCE") return "Balance brought forward";
  if (kind === "CHARGE") return "Match fee charged";
  if (kind === "SETTLEMENT") return "Payment received";
  if (kind === "CAPTAIN_RECEIPT") return "Payment received by captain";
  if (kind === "WAIVER") return "Balance reduced";
  if (kind === "ARRANGEMENT") return "Payment arrangement updated";
  if (kind === "COLLECTION") return "Payment collection updated";
  return kind
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (value) => value.toUpperCase());
}

function entryDetail(kind: string, reason: string) {
  if (kind === "OPENING_BALANCE") {
    return "Existing unpaid match fee carried into your player account.";
  }
  return reason.replaceAll("[SIXFL_PLAYER_LEDGER_RECEIPTS]", "").trim();
}

function formatShortDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatActivityDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLinkDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function fixtureLabel(fee: {
  fixture: {
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
}) {
  return `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`;
}

export default async function PlayerPaymentsPage({ params, searchParams }: PageProps) {
  const { teamid } = await params;
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);
  const requestedPreviewMembershipId = sp.previewMembershipId?.trim() || null;
  const currentHref = withPreview(
    `/player/team/${teamid}/ledger`,
    requestedPreviewMembershipId,
  );

  if (!session?.user?.email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(currentHref)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email.trim().toLowerCase() },
    select: {
      id: true,
      name: true,
      role: true,
      teamMembers: {
        where: { teamId: teamid },
        select: {
          id: true,
          userId: true,
          user: { select: { name: true } },
        },
        take: 1,
      },
    },
  });

  if (!user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(currentHref)}`);
  }

  const previewMembershipId =
    user.role === UserRole.ADMIN ? requestedPreviewMembershipId : null;
  const previewMembership = previewMembershipId
    ? await prisma.teamMember.findFirst({
        where: { id: previewMembershipId, teamId: teamid },
        select: {
          id: true,
          userId: true,
          user: { select: { name: true } },
        },
      })
    : null;

  if (previewMembershipId && !previewMembership) notFound();

  const membership = previewMembership ?? user.teamMembers[0] ?? null;
  if (!membership && user.role !== UserRole.ADMIN) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true },
  });
  if (!team) notFound();

  const accountUserId = previewMembership?.userId ?? membership?.userId ?? user.id;
  const playerName = previewMembership?.user.name ?? membership?.user.name ?? user.name ?? null;
  const summary = await getPlayerLedgerSummaryForUser(teamid, accountUserId);
  const previewParam = previewMembership?.id ?? null;

  if (!summary.anchorFeeId) {
    return (
      <main className="text-white">
        <PlayerPwaModeOnly mode="app">
          <PlayerAppPayments
            teamName={team.name}
            playerName={playerName}
            balancePence={0}
            paidPence={0}
            outstandingFees={[]}
            recentActivity={[]}
            paymentLinks={[]}
            activePlan={null}
          />
        </PlayerPwaModeOnly>

        <PlayerPwaModeOnly mode="web">
          <div className="mx-auto max-w-5xl space-y-5 p-5">
            <Link
              className="text-emerald-200 underline"
              href={withPreview(`/player/team/${teamid}`, previewParam)}
            >
              Back to your team
            </Link>
            <h1 className="text-3xl font-semibold">Your payment history</h1>
            <p>No recorded player charges for this team.</p>
          </div>
        </PlayerPwaModeOnly>
      </main>
    );
  }

  const account = await getPlayerLedgerAccount(teamid, summary.anchorFeeId);
  const stateByFeeId = new Map(account.states.map((state) => [state.feeId, state]));
  const feeById = new Map(account.fees.map((fee) => [fee.id, fee]));

  const outstandingFees: PlayerAppPaymentFee[] = account.fees
    .map((fee) => {
      const state = stateByFeeId.get(fee.id);
      if (!state || state.deletedAt || state.balancePence <= 0) return null;
      return {
        id: fee.id,
        fixtureLabel: fixtureLabel(fee),
        dateLabel: formatShortDate(fee.fixture.kickoffAt),
        balancePence: state.balancePence,
        paymentPath:
          fee.paymentToken && !state.planId
            ? `/pay/player-match-fee/${fee.paymentToken}`
            : null,
        collectionPaused: state.collectionPaused,
        inArrangement: Boolean(state.planId),
      };
    })
    .filter((fee): fee is PlayerAppPaymentFee => Boolean(fee))
    .sort((left, right) => {
      const leftFee = feeById.get(left.id);
      const rightFee = feeById.get(right.id);
      return (
        (rightFee?.fixture.kickoffAt.getTime() ?? 0) -
        (leftFee?.fixture.kickoffAt.getTime() ?? 0)
      );
    });

  const runningBalanceByEntryId = new Map<string, number>();
  let runningBalance = 0;
  for (const entry of account.entries) {
    runningBalance += entry.amountPence;
    runningBalanceByEntryId.set(entry.id, runningBalance);
  }

  const recentActivity: PlayerAppPaymentActivity[] = [...account.entries]
    .sort((left, right) => (left.sequence < right.sequence ? 1 : -1))
    .slice(0, 10)
    .map((entry) => {
      const fee = feeById.get(entry.feeId);
      const displayDate =
        entry.kind === "OPENING_BALANCE" && fee?.fixture.kickoffAt
          ? fee.fixture.kickoffAt
          : entry.createdAt;
      return {
        id: entry.id,
        dateLabel:
          entry.kind === "OPENING_BALANCE"
            ? formatShortDate(displayDate)
            : formatActivityDate(displayDate),
        title: entryTitle(entry.kind),
        detail: entryDetail(entry.kind, entry.reason),
        fixtureLabel: fee
          ? `${fixtureLabel(fee)} · ${formatShortDate(fee.fixture.kickoffAt)}`
          : null,
        amountPence: entry.amountPence,
        balancePence: runningBalanceByEntryId.get(entry.id) ?? 0,
        receivedByCaptain: entry.receivedBy === "CAPTAIN",
      };
    });

  const activePlanRow =
    account.plans.find((plan) => ["ACTIVE", "PAUSED", "REVIEW"].includes(plan.status)) ??
    null;
  let activePlan: PlayerAppPaymentPlan | null = null;

  if (activePlanRow) {
    const planBalance = account.states
      .filter((state) => state.planId === activePlanRow.id)
      .reduce((sum, state) => sum + state.balancePence, 0);
    activePlan = {
      id: activePlanRow.id,
      status: activePlanRow.status,
      balancePence: planBalance,
      nextInstalmentPence: repaymentAmount(activePlanRow, planBalance),
      nextDueLabel: formatShortDate(activePlanRow.nextDueAt),
      paymentPath: `/pay/player-repayment/${activePlanRow.token}`,
    };
  }

  const paidPence = account.states.reduce(
    (sum, state) => sum + state.receivedPence + state.captainReceivedPence,
    0,
  );

  const paymentLinks: PlayerAppPaymentLinkHistory[] = [...account.paymentLinks]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .map((link) => {
      const fee = feeById.get(link.feeId);
      const settlementLabel = getPlayerPaymentLinkSettlementLabel(link, fee, stateByFeeId.get(link.feeId));
      const isCurrentActiveLink =
        !settlementLabel &&
        !link.isRemoved &&
        fee?.paymentToken === link.paymentToken &&
        fee.status === "OPEN";

      return {
        id: link.id,
        settlementLabel,
        fixtureLabel: link.fixtureLabel ?? (fee ? fixtureLabel(fee) : null),
        amountPence: link.amountPence,
        createdLabel: formatLinkDate(link.createdAt),
        activePath: isCurrentActiveLink
          ? `/pay/player-match-fee/${link.paymentToken}`
          : null,
      };
    });

  return (
    <main className="text-white">
      <PlayerPwaModeOnly mode="app">
        <PlayerAppPayments
          teamName={account.teamName}
          playerName={account.playerName || playerName}
          balancePence={account.balancePence}
          paidPence={paidPence}
          outstandingFees={outstandingFees}
          recentActivity={recentActivity}
          paymentLinks={paymentLinks}
          activePlan={activePlan}
        />
      </PlayerPwaModeOnly>

      <PlayerPwaModeOnly mode="web">
        <div className="mx-auto max-w-5xl space-y-5 p-5">
          <Link
            className="text-emerald-200 underline"
            href={withPreview(`/player/team/${teamid}`, previewParam)}
          >
            Back to your team
          </Link>
          <h1 className="text-3xl font-semibold">Your payment history</h1>
          <p>
            {account.teamName} · Total outstanding:{" "}
            <strong>{money(account.balancePence)}</strong>
          </p>
          {account.plans
            .filter((plan) => ["ACTIVE", "PAUSED", "REVIEW"].includes(plan.status))
            .map((plan) => {
              const balance = account.states
                .filter((state) => state.planId === plan.id)
                .reduce((sum, state) => sum + state.balancePence, 0);
              return (
                <section
                  key={plan.id}
                  className="rounded-xl border border-amber-300/25 p-4"
                >
                  <h2 className="font-semibold">Agreed smaller payments</h2>
                  <p>
                    Balance in arrangement: {money(balance)}. Next instalment:{" "}
                    {money(repaymentAmount(plan, balance))}, due{" "}
                    {formatDateTimeInLondon(plan.nextDueAt, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    .
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    New match fees are separate. Status: {plan.status.toLowerCase()}.
                  </p>
                  <Link
                    href={`/pay/player-repayment/${plan.token}`}
                    className="mt-3 inline-block rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-black"
                  >
                    Open agreed payment
                  </Link>
                </section>
              );
            })}
          <PlayerLedgerStatement account={account} />
        </div>
      </PlayerPwaModeOnly>
    </main>
  );
}
