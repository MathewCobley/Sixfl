import { NotificationDispatchStatus } from "@prisma/client";
import Link from "next/link";

import { getCaptainRelatedTeamContext } from "@/lib/captain/related-teams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";

type DeliveryState = "SENT" | "QUEUED";

type Delivery = {
  state: DeliveryState;
  at: Date;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatSentAt(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function playerName(fee: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}) {
  if (fee.teamMember) {
    return fee.teamMember.user.name || fee.teamMember.user.email || "Player";
  }

  if (fee.prospect) {
    return (
      [fee.prospect.firstName, fee.prospect.lastName].filter(Boolean).join(" ") ||
      fee.prospect.email ||
      "Player"
    );
  }

  return "Player";
}

function fixtureLabel(fee: {
  fixture: {
    homeTeam: { name: string };
    awayTeam: { name: string };
  };
}) {
  return `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`;
}

export default async function CaptainPlayerPaymentLinkSummary({
  teamId,
}: {
  teamId: string;
}) {
  const context = await getCaptainRelatedTeamContext(teamId);
  const relatedTeamIds = context?.relatedTeamIds?.length
    ? context.relatedTeamIds
    : [teamId];
  const recentPaidSince = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

  const fees = await prisma.playerMatchFee.findMany({
    where: {
      teamId: { in: relatedTeamIds },
      OR: [
        { status: "OPEN" },
        { status: "PAID", paidAt: { gte: recentPaidSince } },
      ],
      paymentToken: { not: null },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
    select: {
      id: true,
      amountPence: true,
      status: true,
      paidAt: true,
      teamMember: {
        select: {
          user: { select: { name: true, email: true } },
        },
      },
      prospect: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      fixture: {
        select: {
          id: true,
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  if (fees.length === 0) return null;

  const feeIds = fees.map((fee) => fee.id);
  const dispatches = await prisma.notificationDispatch.findMany({
    where: {
      sourceType: "PLAYER_MATCH_FEE_REQUEST",
      sourceId: { in: feeIds },
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      sourceId: true,
      status: true,
      createdAt: true,
      sentAt: true,
    },
  });

  const deliveryByFeeId = new Map<string, Delivery>();
  for (const dispatch of dispatches) {
    const feeId = dispatch.sourceId;
    if (!feeId) continue;

    const next: Delivery =
      dispatch.status === NotificationDispatchStatus.SENT
        ? { state: "SENT", at: dispatch.sentAt ?? dispatch.createdAt }
        : { state: "QUEUED", at: dispatch.createdAt };
    const current = deliveryByFeeId.get(feeId);

    if (!current || (current.state !== "SENT" && next.state === "SENT")) {
      deliveryByFeeId.set(feeId, next);
    }
  }

  const requestedFees = fees.filter((fee) => deliveryByFeeId.has(fee.id));
  if (requestedFees.length === 0) return null;

  const sentCount = requestedFees.filter(
    (fee) => deliveryByFeeId.get(fee.id)?.state === "SENT",
  ).length;
  const queuedCount = requestedFees.length - sentCount;
  const awaitingCount = requestedFees.filter((fee) => fee.status === "OPEN").length;
  const paidCount = requestedFees.filter((fee) => fee.status === "PAID").length;

  const recentRequests = [...requestedFees]
    .sort((left, right) => {
      const leftAt = deliveryByFeeId.get(left.id)?.at.getTime() ?? 0;
      const rightAt = deliveryByFeeId.get(right.id)?.at.getTime() ?? 0;
      return rightAt - leftAt;
    })
    .slice(0, 3);

  const title = sentCount > 0
    ? `${sentCount} player payment link${sentCount === 1 ? " has" : "s have"} been sent`
    : `${queuedCount} player payment link${queuedCount === 1 ? " is" : "s are"} queued to send`;

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_42%),rgba(255,255,255,0.035)] shadow-[0_18px_65px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/75">
            Player payments
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">
            {awaitingCount > 0
              ? `${awaitingCount} ${awaitingCount === 1 ? "is" : "are"} still awaiting payment.`
              : "There are no outstanding player payments in these requests."}
            {paidCount > 0
              ? ` ${paidCount} ${paidCount === 1 ? "has" : "have"} paid.`
              : ""}
            {queuedCount > 0
              ? ` ${queuedCount} ${queuedCount === 1 ? "message is" : "messages are"} still queued for delivery.`
              : ""}
          </p>

          <div className="mt-4 grid gap-2 lg:grid-cols-3">
            {recentRequests.map((fee) => {
              const delivery = deliveryByFeeId.get(fee.id)!;
              return (
                <div
                  key={fee.id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 font-semibold text-white">
                      {playerName(fee)}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                        fee.status === "PAID"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                          : "border-amber-400/25 bg-amber-500/10 text-amber-100"
                      }`}
                    >
                      {fee.status === "PAID" ? "Paid" : "Awaiting payment"}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-white/45">
                    {fixtureLabel(fee)} · {formatMoney(fee.amountPence)}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-emerald-100/75">
                    {delivery.state === "SENT" ? "Payment link sent" : "Payment link queued"}
                    {` · ${formatSentAt(delivery.at)}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Link
          href={`/captain/team/${teamId}/player-payments`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/15"
        >
          View player payments
        </Link>
      </div>
    </section>
  );
}
