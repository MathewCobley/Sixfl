// ========================================
// File: src/app/captain/team/[teamid]/player-payments/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import type { PaymentChargeStatus, PlayerMatchFeeStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { createCaptainSquadPaymentCollectionAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Squad Payments | SIXFL",
};

type Props = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ fixtureId?: string; saved?: string; error?: string }>;
};

type Tone = "white" | "emerald" | "amber" | "sky" | "red";

type FixturePaymentSummary = {
  players: number;
  paidCount: number;
  openCount: number;
  waivedCount: number;
  totalPence: number;
  paidPence: number;
  openPence: number;
  waivedPence: number;
};

type TeamChargeSummary = {
  amountPence: number;
  paidPence: number;
  outstandingPence: number;
  status: PaymentChargeStatus;
};

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getFixtureLabel(input: { homeTeamName: string; awayTeamName: string }) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getFeeStatusLabel(status: PlayerMatchFeeStatus) {
  switch (status) {
    case "PAID":
      return "Paid";
    case "WAIVED":
      return "Waived";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Unpaid";
  }
}

function getFeeStatusClasses(status: PlayerMatchFeeStatus) {
  switch (status) {
    case "PAID":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "WAIVED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "CANCELLED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
}

function getToneClasses(tone: Tone) {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70";
    case "amber":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100/70";
    case "sky":
      return "border-sky-400/20 bg-sky-500/10 text-sky-100/70";
    case "red":
      return "border-red-400/20 bg-red-500/10 text-red-100/70";
    default:
      return "border-white/10 bg-white/[0.04] text-white/45";
  }
}

function getPillClasses(tone: Tone) {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "amber":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "sky":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "red":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/60";
  }
}

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "collection_created":
      return "Squad payment collection updated. Share the payment links with your players.";
    default:
      return null;
  }
}

function getErrorMessage(error?: string) {
  switch (error) {
    case "missing_fixture":
      return "Choose a fixture first.";
    case "invalid_amount":
      return "Enter a valid default amount per player.";
    case "invalid_player_amount":
      return "One of the player amounts is not valid. Use 0.00 for waived players or a positive amount for payment links.";
    case "no_players":
      return "Select at least one player to collect from.";
    case "fixture_not_found":
      return "That fixture could not be found for this team.";
    default:
      return null;
  }
}

function getPlayerName(fee: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
}) {
  if (fee.teamMember) return fee.teamMember.user.name || fee.teamMember.user.email || "Unnamed member";
  if (fee.prospect) {
    return (
      [fee.prospect.firstName, fee.prospect.lastName].filter(Boolean).join(" ") ||
      fee.prospect.email ||
      fee.prospect.phone ||
      "Unnamed player"
    );
  }
  return "Unknown player";
}

function getPlayerContact(input: {
  memberEmail?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
}) {
  return [input.memberEmail, input.prospectEmail, input.prospectPhone].filter(Boolean).join(" · ") || "No contact saved";
}

function isTeamChargePaid(charge?: TeamChargeSummary | null) {
  if (!charge) return false;
  return charge.status === "PAID" || charge.paidPence >= charge.amountPence;
}

function getAllocationStatus(input: { allocatedPence: number; teamFeePence: number }) {
  const unallocatedPence = Math.max(input.teamFeePence - input.allocatedPence, 0);
  const overAllocatedPence = Math.max(input.allocatedPence - input.teamFeePence, 0);

  if (unallocatedPence > 0) {
    return {
      label: `Unallocated ${formatMoney(unallocatedPence)}`,
      helper: `${formatMoney(input.allocatedPence)} allocated from ${formatMoney(input.teamFeePence)} team fee`,
      tone: "amber" as const,
      unallocatedPence,
      overAllocatedPence,
    };
  }

  if (overAllocatedPence > 0) {
    return {
      label: `Over allocated ${formatMoney(overAllocatedPence)}`,
      helper: `${formatMoney(input.allocatedPence)} allocated against ${formatMoney(input.teamFeePence)} team fee`,
      tone: "sky" as const,
      unallocatedPence,
      overAllocatedPence,
    };
  }

  return {
    label: "Fully allocated",
    helper: `${formatMoney(input.allocatedPence)} allocated against ${formatMoney(input.teamFeePence)} team fee`,
    tone: "emerald" as const,
    unallocatedPence,
    overAllocatedPence,
  };
}

function getFixturePaymentBadge(input: {
  summary?: FixturePaymentSummary;
  teamFeePence: number;
  teamCharge?: TeamChargeSummary | null;
}) {
  const summary = input.summary ?? {
    players: 0,
    paidCount: 0,
    openCount: 0,
    waivedCount: 0,
    totalPence: 0,
    paidPence: 0,
    openPence: 0,
    waivedPence: 0,
  };

  const chargePaid = isTeamChargePaid(input.teamCharge);
  const teamChargeAmountPence = input.teamCharge?.amountPence ?? input.teamFeePence;
  const teamChargePaidPence = input.teamCharge?.paidPence ?? 0;
  const teamFeeStillToCoverPence = chargePaid
    ? 0
    : Math.max(teamChargeAmountPence - teamChargePaidPence, 0);
  const allocation = getAllocationStatus({
    allocatedPence: summary.totalPence,
    teamFeePence: input.teamFeePence,
  });

  if (chargePaid) {
    return {
      label: "Team paid",
      lines: [
        `Team charge paid ${formatMoney(teamChargePaidPence || teamChargeAmountPence)} / ${formatMoney(teamChargeAmountPence)}`,
        "No action needed for the team fee",
        `Player allocation ${formatMoney(summary.totalPence)} / ${formatMoney(input.teamFeePence)}`,
        `Player payments outstanding ${formatMoney(summary.openPence)}`,
      ],
      pills: [
        { label: "Team paid", tone: "emerald" as Tone },
        { label: "No action needed", tone: "emerald" as Tone },
        { label: `Player outstanding ${formatMoney(summary.openPence)}`, tone: summary.openPence > 0 ? "amber" as Tone : "white" as Tone },
      ],
      classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    };
  }

  const playerOutstandingTone: Tone = summary.openPence > 0 ? "amber" : "white";
  const teamCoverTone: Tone = teamFeeStillToCoverPence > 0 ? "red" : "emerald";
  const pills = [
    { label: allocation.label, tone: allocation.tone },
    { label: `Player outstanding ${formatMoney(summary.openPence)}`, tone: playerOutstandingTone },
    { label: `Team still to cover ${formatMoney(teamFeeStillToCoverPence)}`, tone: teamCoverTone },
  ];
  const lines = [
    `Allocated ${formatMoney(summary.totalPence)} / ${formatMoney(input.teamFeePence)}`,
    allocation.overAllocatedPence > 0
      ? `Over allocated ${formatMoney(allocation.overAllocatedPence)}`
      : `Unallocated ${formatMoney(allocation.unallocatedPence)}`,
    `Player payments outstanding ${formatMoney(summary.openPence)}`,
    `Team fee still to cover ${formatMoney(teamFeeStillToCoverPence)}`,
  ];

  if (summary.players === 0) {
    return {
      label: "Not started",
      lines,
      pills,
      classes: "border-white/10 bg-white/[0.04] text-white/55",
    };
  }

  if (summary.openCount === 0) {
    return {
      label: summary.paidCount > 0 ? "Player paid" : "Waived",
      lines: [`${summary.paidCount}/${summary.players} player payments paid`, ...lines],
      pills,
      classes: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
    };
  }

  if (summary.paidCount > 0 || summary.waivedCount > 0) {
    return {
      label: "Part paid",
      lines: [`${summary.paidCount}/${summary.players} player payments paid`, ...lines],
      pills,
      classes: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    };
  }

  return {
    label: "Outstanding",
    lines: [`${summary.players} player${summary.players === 1 ? "" : "s"}`, ...lines],
    pills,
    classes: "border-red-400/25 bg-red-500/10 text-red-100",
  };
}

export default async function CaptainPlayerPaymentsPage({ params, searchParams }: Props) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const sp = (await searchParams) ?? {};

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      matchdayTargetSize: true,
      league: { select: { id: true, name: true, season: true } },
    },
  });

  if (!team) notFound();

  const [fixtures, members, prospects] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        status: { in: ["SCHEDULED", "COMPLETED"] },
      },
      orderBy: [{ kickoffAt: "desc" }],
      take: 40,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } },
      },
    }),
    prisma.teamMember.findMany({
      where: { teamId: teamid },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.teamPlayerProspect.findMany({
      where: {
        teamId: teamid,
        status: { in: ["QUALIFIED", "CONTACTED", "NEW"] },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
      },
    }),
  ]);

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const [fixturePaymentRows, teamChargeRows] = await Promise.all([
    fixtureIds.length
      ? prisma.playerMatchFee.findMany({
          where: {
            teamId: teamid,
            fixtureId: { in: fixtureIds },
            status: { not: "CANCELLED" },
          },
          select: {
            fixtureId: true,
            amountPence: true,
            status: true,
          },
        })
      : [],
    fixtureIds.length
      ? prisma.paymentCharge.findMany({
          where: {
            teamId: teamid,
            fixtureId: { in: fixtureIds },
          },
          select: {
            fixtureId: true,
            amountPence: true,
            status: true,
            transactions: { select: { amountPence: true } },
          },
        })
      : [],
  ]);

  const paymentSummaryByFixtureId = new Map<string, FixturePaymentSummary>();

  for (const fee of fixturePaymentRows) {
    const existing = paymentSummaryByFixtureId.get(fee.fixtureId) ?? {
      players: 0,
      paidCount: 0,
      openCount: 0,
      waivedCount: 0,
      totalPence: 0,
      paidPence: 0,
      openPence: 0,
      waivedPence: 0,
    };

    existing.players += 1;
    existing.totalPence += fee.amountPence;

    if (fee.status === "PAID") {
      existing.paidCount += 1;
      existing.paidPence += fee.amountPence;
    }

    if (fee.status === "OPEN") {
      existing.openCount += 1;
      existing.openPence += fee.amountPence;
    }

    if (fee.status === "WAIVED") {
      existing.waivedCount += 1;
      existing.waivedPence += fee.amountPence;
    }

    paymentSummaryByFixtureId.set(fee.fixtureId, existing);
  }

  const teamChargeByFixtureId = new Map<string, TeamChargeSummary>();

  for (const charge of teamChargeRows) {
    if (!charge.fixtureId) continue;
    const paidPence = charge.transactions.reduce((sum, transaction) => sum + transaction.amountPence, 0);
    teamChargeByFixtureId.set(charge.fixtureId, {
      amountPence: charge.amountPence,
      paidPence,
      outstandingPence: Math.max(charge.amountPence - paidPence, 0),
      status: charge.status,
    });
  }

  const now = new Date();
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ??
    fixtures.find((fixture) => fixture.kickoffAt >= now) ??
    fixtures[0] ??
    null;

  async function loadFees() {
    return selectedFixture
      ? prisma.playerMatchFee.findMany({
          where: { teamId: teamid, fixtureId: selectedFixture.id },
          orderBy: [{ createdAt: "asc" }],
          include: {
            teamMember: { include: { user: { select: { name: true, email: true } } } },
            prospect: { select: { firstName: true, lastName: true, email: true, phone: true } },
          },
        })
      : [];
  }

  let fees = await loadFees();
  const openFeeIdsWithoutLinks = fees
    .filter((fee) => fee.status === "OPEN" && (!fee.paymentToken || !fee.paymentUrl))
    .map((fee) => fee.id);

  if (openFeeIdsWithoutLinks.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(openFeeIdsWithoutLinks);
    fees = await loadFees();
  }

  const activeFees = fees.filter((fee) => fee.status !== "CANCELLED");
  const selectedMemberIds = new Set(
    activeFees.filter((fee) => fee.teamMemberId).map((fee) => fee.teamMemberId as string),
  );
  const selectedProspectIds = new Set(
    activeFees.filter((fee) => fee.prospectId).map((fee) => fee.prospectId as string),
  );
  const feeByMemberId = new Map(
    activeFees.filter((fee) => fee.teamMemberId).map((fee) => [fee.teamMemberId as string, fee]),
  );
  const feeByProspectId = new Map(
    activeFees.filter((fee) => fee.prospectId).map((fee) => [fee.prospectId as string, fee]),
  );

  const linkedMemberKeys = new Set(
    members.flatMap((member) =>
      [member.user.email?.trim().toLowerCase(), member.user.name?.trim().toLowerCase()].filter(Boolean) as string[],
    ),
  );

  const selectableProspects = prospects.filter((prospect) => {
    const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim().toLowerCase();
    const email = prospect.email?.trim().toLowerCase();
    return !((email && linkedMemberKeys.has(email)) || (fullName && linkedMemberKeys.has(fullName)));
  });

  const totals = activeFees.reduce(
    (acc, fee) => {
      acc.total += fee.amountPence;
      if (fee.status === "PAID") acc.paid += fee.amountPence;
      if (fee.status === "OPEN") acc.open += fee.amountPence;
      if (fee.status === "WAIVED") acc.waived += fee.amountPence;
      return acc;
    },
    { total: 0, paid: 0, open: 0, waived: 0 },
  );
  const paidCount = activeFees.filter((fee) => fee.status === "PAID").length;
  const openCount = activeFees.filter((fee) => fee.status === "OPEN").length;
  const waivedCount = activeFees.filter((fee) => fee.status === "WAIVED").length;
  const defaultAmount = activeFees.find((fee) => fee.status !== "PAID")?.amountPence ?? 400;
  const teamFeePence = selectedFixture?.matchFeePence ?? 4000;
  const selectedTeamCharge = selectedFixture ? teamChargeByFixtureId.get(selectedFixture.id) : null;
  const selectedTeamChargePaid = isTeamChargePaid(selectedTeamCharge);
  const allocation = getAllocationStatus({ allocatedPence: totals.total, teamFeePence });
  const teamFeeStillToCoverPence = selectedTeamChargePaid
    ? 0
    : selectedTeamCharge
      ? selectedTeamCharge.outstandingPence
      : Math.max(teamFeePence - totals.paid, 0);
  const savedMessage = getSavedMessage(sp.saved);
  const errorMessage = getErrorMessage(sp.error);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Squad payments</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Collect money from your players</h2>
          <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
            Set a default amount, adjust individual player amounts for subs or guests, then share secure Stripe payment links and track who has paid. The team still remains responsible for the SIXFL fixture fee.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/captain/team/${team.id}`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white">
              Back to captain hub
            </Link>
            <Link href={`/captain/team/${team.id}/squad`} className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20">
              Open squad
            </Link>
          </div>
        </div>
      </section>

      {savedMessage ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Team fee", value: formatMoney(teamFeePence), text: selectedTeamChargePaid ? "Team charge already paid." : "Fixed SIXFL fee for this fixture.", tone: selectedTeamChargePaid ? "emerald" as Tone : "white" as Tone },
          { label: "Allocated", value: formatMoney(totals.total), text: allocation.label, tone: allocation.tone },
          { label: "Collected", value: formatMoney(totals.paid), text: `${paidCount} player payments · ${waivedCount} waived`, tone: "emerald" as Tone },
          { label: "Player payments outstanding", value: formatMoney(totals.open), text: `${openCount} unpaid player${openCount === 1 ? "" : "s"}`, tone: openCount > 0 ? "amber" as Tone : "white" as Tone },
          { label: "Team fee still to cover", value: formatMoney(teamFeeStillToCoverPence), text: selectedTeamChargePaid ? "No action needed." : "Based on team charge ledger.", tone: teamFeeStillToCoverPence > 0 ? "red" as Tone : "emerald" as Tone },
        ].map((item) => (
          <div key={item.label} className={`rounded-3xl border p-5 ${getToneClasses(item.tone)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
            <p className="mt-2 text-sm text-white/55">{item.text}</p>
          </div>
        ))}
      </section>

      {activeFees.length > 0 || selectedFixture ? (
        <section className={`rounded-3xl border p-5 text-sm ${getToneClasses(selectedTeamChargePaid ? "emerald" : allocation.tone)}`}>
          <div className="font-semibold text-white">Allocation and payment check</div>
          <p className="mt-2 text-white/70">
            {selectedTeamChargePaid
              ? `The team charge for this fixture is already paid. No action is needed for the team fee. Player allocation is optional and currently ${formatMoney(totals.total)} / ${formatMoney(teamFeePence)}.`
              : `Allocated to players: ${formatMoney(totals.total)} / ${formatMoney(teamFeePence)}. ${allocation.helper}. Player payments outstanding: ${formatMoney(totals.open)}. Team fee still to cover from the team ledger: ${formatMoney(teamFeeStillToCoverPence)}.`}
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">Pick the fixture or week you want to collect player payments for.</p>
          <div className="mt-5 space-y-2">
            {fixtures.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No fixtures are available for this team yet.</div> : null}
            {fixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              const isPast = fixture.kickoffAt < now;
              const paymentBadge = getFixturePaymentBadge({
                summary: paymentSummaryByFixtureId.get(fixture.id),
                teamFeePence: fixture.matchFeePence ?? 4000,
                teamCharge: teamChargeByFixtureId.get(fixture.id),
              });

              return (
                <Link
                  key={fixture.id}
                  href={`/captain/team/${team.id}/player-payments?fixtureId=${fixture.id}`}
                  className={`block rounded-2xl border p-4 transition ${isSelected ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}</div>
                    {isPast ? <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">Past fixture</span> : null}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${paymentBadge.classes}`}>{paymentBadge.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {formatUkDateTime(fixture.kickoffAt)}{fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {paymentBadge.pills.map((pill) => (
                      <span key={pill.label} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getPillClasses(pill.tone)}`}>
                        {pill.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-white/55">
                    {paymentBadge.lines.map((line) => <div key={line}>{line}</div>)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Create / update collection</h2>
          <p className="mt-1 text-sm text-white/55">Set a default amount, then adjust any individual player amount. Enter 0.00 to waive a player. Paid rows stay locked and will not be reset.</p>

          {selectedFixture ? (
            <form action={createCaptainSquadPaymentCollectionAction} className="mt-5 space-y-5">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="fixtureId" value={selectedFixture.id} />

              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4">
                <label htmlFor="amount" className="text-sm font-medium text-emerald-50">Default amount per player</label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input id="amount" name="amount" type="text" inputMode="decimal" defaultValue={(defaultAmount / 100).toFixed(2)} className="w-full max-w-[180px] rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
                  <p className="text-sm text-emerald-100/70">This fills the standard amount. Change individual player boxes below for subs or guests.</p>
                </div>
              </div>

              <div className={`grid gap-4 ${selectableProspects.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <h3 className="font-semibold text-white">Linked squad members</h3>
                  <div className="mt-3 space-y-2">
                    {members.length === 0 ? <div className="text-sm text-white/45">No linked members yet.</div> : null}
                    {members.map((member) => {
                      const existingFee = feeByMemberId.get(member.id);
                      const isPaid = existingFee?.status === "PAID";
                      const amountValue = ((existingFee?.amountPence ?? defaultAmount) / 100).toFixed(2);

                      return (
                        <div key={member.id} className={`rounded-xl border border-white/10 p-3 text-sm ${isPaid ? "bg-emerald-500/[0.06]" : "bg-white/[0.03]"}`}>
                          {isPaid ? <input type="hidden" name="player" value={`member:${member.id}`} /> : null}
                          <label className="flex items-start gap-3 text-white/75">
                            <input type="checkbox" name="player" value={`member:${member.id}`} defaultChecked={selectedMemberIds.has(member.id)} disabled={isPaid} className="mt-1" />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="block font-medium text-white">{member.user.name || member.user.email || "Unnamed member"}</span>
                                {existingFee ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getFeeStatusClasses(existingFee.status)}`}>{getFeeStatusLabel(existingFee.status)}</span> : null}
                              </span>
                              <span className="mt-1 block text-xs text-white/45">{member.user.email || "No email saved"}</span>
                            </span>
                          </label>
                          <div className="mt-3 flex items-center gap-2 pl-7">
                            <label htmlFor={`amount_member_${member.id}`} className="text-xs font-medium text-white/50">Amount</label>
                            <input id={`amount_member_${member.id}`} name={`amount_member_${member.id}`} type="text" inputMode="decimal" defaultValue={amountValue} disabled={isPaid} className="w-24 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-45" />
                            {isPaid ? <span className="text-xs text-emerald-100/65">Locked because already paid</span> : <span className="text-xs text-white/35">Use 0.00 to waive</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectableProspects.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="font-semibold text-white">Extra / unlinked players</h3>
                    <p className="mt-1 text-xs text-white/45">Use this for someone who played but is not yet linked to the squad.</p>
                    <div className="mt-3 space-y-2">
                      {selectableProspects.map((prospect) => {
                        const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();
                        const existingFee = feeByProspectId.get(prospect.id);
                        const isPaid = existingFee?.status === "PAID";
                        const amountValue = ((existingFee?.amountPence ?? defaultAmount) / 100).toFixed(2);

                        return (
                          <div key={prospect.id} className={`rounded-xl border border-white/10 p-3 text-sm ${isPaid ? "bg-emerald-500/[0.06]" : "bg-white/[0.03]"}`}>
                            {isPaid ? <input type="hidden" name="player" value={`prospect:${prospect.id}`} /> : null}
                            <label className="flex items-start gap-3 text-white/75">
                              <input type="checkbox" name="player" value={`prospect:${prospect.id}`} defaultChecked={selectedProspectIds.has(prospect.id)} disabled={isPaid} className="mt-1" />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="block font-medium text-white">{fullName || prospect.email || prospect.phone || "Unnamed player"}</span>
                                  {existingFee ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getFeeStatusClasses(existingFee.status)}`}>{getFeeStatusLabel(existingFee.status)}</span> : null}
                                </span>
                                <span className="block text-xs text-white/45">{[prospect.email, prospect.phone].filter(Boolean).join(" · ") || "No contact saved"}</span>
                              </span>
                            </label>
                            <div className="mt-3 flex items-center gap-2 pl-7">
                              <label htmlFor={`amount_prospect_${prospect.id}`} className="text-xs font-medium text-white/50">Amount</label>
                              <input id={`amount_prospect_${prospect.id}`} name={`amount_prospect_${prospect.id}`} type="text" inputMode="decimal" defaultValue={amountValue} disabled={isPaid} className="w-24 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-45" />
                              {isPaid ? <span className="text-xs text-emerald-100/65">Locked because already paid</span> : <span className="text-xs text-white/35">Use 0.00 to waive</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <button type="submit" className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400">Create / refresh payment links</button>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">Create or select a fixture before collecting player payments.</div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Payment tracker</h2>
            <p className="mt-1 text-sm text-white/55">Share each player link and watch the status change to paid once Stripe confirms payment.</p>
          </div>
          {selectedFixture ? <div className="text-sm text-white/55">{getFixtureLabel({ homeTeamName: selectedFixture.homeTeam.name, awayTeamName: selectedFixture.awayTeam.name })}</div> : null}
        </div>

        <div className="mt-5 space-y-3">
          {activeFees.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">No player payment collection has been created for this fixture yet.</div> : null}

          {activeFees.map((fee) => {
            const playerName = getPlayerName(fee);
            const contact = getPlayerContact({
              memberEmail: fee.teamMember?.user.email,
              prospectEmail: fee.prospect?.email,
              prospectPhone: fee.prospect?.phone,
            });
            const shareText = `Hi ${playerName}, please pay your ${formatMoney(fee.amountPence)} SIXFL match fee here: ${fee.paymentUrl ?? ""}`;
            const shareHref = fee.paymentUrl ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : null;

            return (
              <div key={fee.id} className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-white">{playerName}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getFeeStatusClasses(fee.status)}`}>{getFeeStatusLabel(fee.status)}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">{formatMoney(fee.amountPence)}</span>
                  </div>
                  <div className="mt-1 text-sm text-white/50">{contact}</div>
                  {fee.paidAt ? <div className="mt-1 text-xs text-emerald-100/65">Paid {formatUkDateTime(fee.paidAt)}</div> : null}
                  {fee.waivedAt ? <div className="mt-1 text-xs text-sky-100/65">Waived {formatUkDateTime(fee.waivedAt)}</div> : null}
                  {fee.status === "OPEN" && fee.paymentUrl ? <div className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/60">{fee.paymentUrl}</div> : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {fee.status === "OPEN" && fee.paymentUrl ? (
                    <>
                      <Link href={fee.paymentUrl} target="_blank" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">Open link</Link>
                      {shareHref ? <Link href={shareHref} target="_blank" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10">Share on WhatsApp</Link> : null}
                    </>
                  ) : fee.status === "PAID" ? (
                    <span className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100">Paid</span>
                  ) : fee.status === "WAIVED" ? (
                    <span className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-100">Waived</span>
                  ) : (
                    <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/50">No payment link</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
