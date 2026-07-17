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
    return input.teamMember.user.name || input.teamMember.user.email || "Team member";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || input.prospect.email || "Team member";
  }

  return "Team member";
}

function getDisplayNote(note: string | null) {
  if (!note) return null;

  return note
    .replace(/SIXFL player payment link:/gi, "SIXFL team match fee payment link:")
    .replace(/for this player\.?/gi, "for this squad contribution.")
    .replace(/player match fee/gi, "team match fee contribution")
    .replace(/player fee/gi, "team fee contribution");
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
      note: true,
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

  const playerName = getPlayerName({
    teamMember: fee.teamMember,
    prospect: fee.prospect,
  });
  const displayNote = getDisplayNote(fee.note);
  const canPay = fee.status === PlayerMatchFeeStatus.OPEN && Boolean(fee.paymentToken);
  const playerDashboardHref = `/player/team/${fee.team.id}`;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Secure team fee payment
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Team match fee contribution
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
            Review this contribution towards your team's match fee and continue to Stripe to complete payment securely.
          </p>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Team member
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

              {displayNote ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">
                  {displayNote}
                </div>
              ) : null}
            </div>

            <div className="min-w-[220px] rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-5 text-left lg:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Amount
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
                  Continue to secure payment
                </button>
                <p className="text-sm text-white/50">Secure payment powered by Stripe.</p>
              </form>
            ) : fee.status === PlayerMatchFeeStatus.PAID ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                This team match fee contribution has already been paid.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/60">
                This team match fee contribution is no longer available for online payment.
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
