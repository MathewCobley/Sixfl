// ========================================
// File: src/app/pay/player-match-fee/[token]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { PlayerMatchFeeStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
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

function getPlayerName(input: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string; lastName: string | null; email: string | null } | null;
}) {
  if (input.teamMember) {
    return input.teamMember.user.name || input.teamMember.user.email || "Player";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || input.prospect.email || "Player";
  }

  return "Player";
}

export default async function PayPlayerMatchFeePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const fee = await prisma.playerMatchFee.findUnique({
    where: {
      paymentToken: token,
    },
    select: {
      id: true,
      amountPence: true,
      status: true,
      paymentToken: true,
      teamMemberId: true,
      prospectId: true,
      team: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
        },
      },
      fixture: {
        select: {
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          league: {
            select: {
              name: true,
              season: true,
              slug: true,
            },
          },
        },
      },
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
        },
      },
    },
  });

  if (!fee) {
    notFound();
  }

  const outstandingFees = fee.teamMemberId
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: fee.team.id,
          teamMemberId: fee.teamMemberId,
          status: PlayerMatchFeeStatus.OPEN,
          fixture: { publishedAt: { not: null } },
        },
        select: { id: true, amountPence: true },
      })
    : fee.prospectId
      ? await prisma.playerMatchFee.findMany({
          where: {
            teamId: fee.team.id,
            prospectId: fee.prospectId,
            status: PlayerMatchFeeStatus.OPEN,
            fixture: { publishedAt: { not: null } },
          },
          select: { id: true, amountPence: true },
        })
      : fee.status === PlayerMatchFeeStatus.OPEN
        ? [{ id: fee.id, amountPence: fee.amountPence }]
        : [];

  const playerName = getPlayerName({
    teamMember: fee.teamMember,
    prospect: fee.prospect,
  });
  const canPay = fee.status === PlayerMatchFeeStatus.OPEN && Boolean(fee.paymentToken);
  const totalOutstandingPence = outstandingFees.reduce(
    (sum, outstandingFee) => sum + outstandingFee.amountPence,
    0,
  );
  const remainingAfterThisFeePence = Math.max(totalOutstandingPence - fee.amountPence, 0);
  const hasMultipleOutstandingFees = canPay && outstandingFees.length > 1;
  const playerDashboardHref = `/player/team/${fee.team.id}`;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Secure player payment
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Player match fee
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
            Review this individual match fee below and continue to Stripe to complete payment securely.
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-8">
          {hasMultipleOutstandingFees ? (
            <div className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-amber-50">
              <div className="text-base font-semibold">
                You have {outstandingFees.length} unpaid match fees totalling {formatMoney(totalOutstandingPence)}.
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-100/75">
                This page pays one {formatMoney(fee.amountPence)} fee only. After this payment, {formatMoney(remainingAfterThisFeePence)} will remain across your other match fees.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Player
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">{playerName}</h2>
              <p className="mt-1 text-sm text-white/55">{fee.team.name}</p>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/70">
                <div className="font-semibold text-white">
                  {fee.fixture.homeTeam.name} vs {fee.fixture.awayTeam.name}
                </div>
                <div className="mt-1 text-white/50">
                  {formatKickoff(fee.fixture.kickoffAt)}
                </div>
                <div className="mt-1 text-white/50">
                  {fee.fixture.league.name}
                  {fee.fixture.league.season ? ` · ${fee.fixture.league.season}` : ""}
                </div>
              </div>
            </div>

            <div className="min-w-[220px] rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-5 text-left lg:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                This match fee
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {formatMoney(fee.amountPence)}
              </div>
              <div className="mt-2 text-xs uppercase tracking-[0.14em] text-white/45">
                {fee.status}
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            {canPay ? (
              <form action={`/pay/player-match-fee/${token}/start`} method="post" className="space-y-3">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
                >
                  Pay this {formatMoney(fee.amountPence)} fee
                </button>
                <p className="text-sm text-white/50">
                  {hasMultipleOutstandingFees
                    ? "This payment covers this fixture only. Your other match fees remain available from your player dashboard."
                    : "Secure payment powered by Stripe."}
                </p>
              </form>
            ) : fee.status === PlayerMatchFeeStatus.PAID ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                This player match fee has already been paid.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/60">
                This player match fee is no longer available for online payment.
              </div>
            )}
          </div>
        </section>

        <div className="flex justify-center">
          <Link
            href={playerDashboardHref}
            className="text-sm font-medium text-white/55 transition hover:text-white/80"
          >
            Back to player dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
