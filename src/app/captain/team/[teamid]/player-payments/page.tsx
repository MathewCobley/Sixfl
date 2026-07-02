// ========================================
// File: src/app/captain/team/[teamid]/player-payments/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import type { PaymentChargeStatus, PlayerMatchFeeStatus } from "@prisma/client";

import SquadPaymentAmountSync from "@/components/captain/SquadPaymentAmountSync";
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
  title: string;
  dueDate: Date | null;
  fixtureId: string | null;
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amountPence / 100);
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateKey(value: Date | null | undefined) {
  if (!value) return null;
  return formatDateTimeInLondon(value, { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getFixtureLabel(input: { homeTeamName: string; awayTeamName: string }) {
  return `${input.homeTeamName} vs ${input.awayTeamName}`;
}

function getFeeStatusLabel(status: PlayerMatchFeeStatus) {
  if (status === "PAID") return "Paid";
  if (status === "WAIVED") return "Waived";
  if (status === "CANCELLED") return "Cancelled";
  return "Unpaid";
}

function getFeeStatusClasses(status: PlayerMatchFeeStatus) {
  if (status === "PAID") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === "WAIVED") return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  if (status === "CANCELLED") return "border-red-400/25 bg-red-500/10 text-red-100";
  return "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function getToneClasses(tone: Tone) {
  if (tone === "emerald") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70";
  if (tone === "amber") return "border-amber-400/25 bg-amber-500/10 text-amber-100/70";
  if (tone === "sky") return "border-sky-400/20 bg-sky-500/10 text-sky-100/70";
  if (tone === "red") return "border-red-400/20 bg-red-500/10 text-red-100/70";
  return "border-white/10 bg-white/[0.04] text-white/45";
}

function isPlayerMatchFeeTransaction(transaction: { notes: string | null }) {
  const notes = transaction.notes?.toLowerCase() ?? "";
  return notes.includes("player match fee paid online") || notes.includes("player fee id:");
}

function getDisplayChargeStatus(input: {
  storedStatus: PaymentChargeStatus;
  amountPence: number;
  paidPence: number;
}): PaymentChargeStatus {
  if (input.storedStatus === "VOID" || input.storedStatus === "PAID") return input.storedStatus;
  if (input.paidPence >= input.amountPence) return "PAID";
  if (input.paidPence > 0) return "PART_PAID";
  return input.storedStatus;
}

function isTeamChargePaid(charge?: TeamChargeSummary | null) {
  if (!charge) return false;
  return charge.status === "PAID" || charge.paidPence >= charge.amountPence;
}

function isAdjustedTeamCharge(input: { teamFeePence: number; teamCharge?: TeamChargeSummary | null }) {
  return Boolean(input.teamCharge && input.teamCharge.amountPence !== input.teamFeePence);
}

function getAdjustmentAmount(input: { teamFeePence: number; teamCharge?: TeamChargeSummary | null }) {
  if (!input.teamCharge) return 0;
  return input.teamFeePence - input.teamCharge.amountPence;
}

function getAllocationStatus(input: { allocatedPence: number; teamFeePence: number }) {
  const unallocatedPence = Math.max(input.teamFeePence - input.allocatedPence, 0);
  const overAllocatedPence = Math.max(input.allocatedPence - input.teamFeePence, 0);

  if (unallocatedPence > 0) return { tone: "amber" as Tone, unallocatedPence, overAllocatedPence };
  if (overAllocatedPence > 0) return { tone: "sky" as Tone, unallocatedPence, overAllocatedPence };
  return { tone: "emerald" as Tone, unallocatedPence, overAllocatedPence };
}

function getSavedMessage(saved?: string) {
  if (saved === "collection_created") {
    return "Squad payment collection updated. Player payment emails have been queued where email addresses are saved.";
  }
  return null;
}

function getErrorMessage(error?: string) {
  if (error === "missing_fixture") return "Choose a fixture first.";
  if (error === "invalid_amount") return "Enter a valid default amount per player.";
  if (error === "invalid_player_amount") return "One of the player amounts is not valid. Use 0.00 for waived players or a positive amount for payment links.";
  if (error === "no_players") return "Select at least one player to collect from.";
  if (error === "fixture_not_found") return "That fixture could not be found for this team.";
  return null;
}

function getPlayerName(fee: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
}) {
  if (fee.teamMember) return fee.teamMember.user.name || fee.teamMember.user.email || "Unnamed member";
  if (fee.prospect) {
    return [fee.prospect.firstName, fee.prospect.lastName].filter(Boolean).join(" ") || fee.prospect.email || fee.prospect.phone || "Unnamed player";
  }
  return "Unknown player";
}

function getPlayerContact(input: { memberEmail?: string | null; prospectEmail?: string | null; prospectPhone?: string | null }) {
  return [input.memberEmail, input.prospectEmail, input.prospectPhone].filter(Boolean).join(" · ") || "No contact saved";
}

export default async function CaptainPlayerPaymentsPage({ params, searchParams }: Props) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const sp = (await searchParams) ?? {};

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true, matchdayTargetSize: true, league: { select: { id: true, name: true, season: true } } },
  });

  if (!team) notFound();

  const [fixtures, members, prospects, allCharges] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }],
        status: { in: ["SCHEDULED", "COMPLETED"] },
        AND: [
          {
            OR: [
              { publishedAt: { not: null } },
              { playerMatchFees: { some: { teamId: teamid, status: { not: "CANCELLED" } } } },
              { paymentCharges: { some: { teamId: teamid, status: { not: "VOID" } } } },
            ],
          },
        ],
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
      where: { teamId: teamid, status: { in: ["QUALIFIED", "CONTACTED", "NEW"] } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true },
    }),
    prisma.paymentCharge.findMany({
      where: { teamId: teamid },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        fixtureId: true,
        amountPence: true,
        status: true,
        dueDate: true,
        title: true,
        transactions: { select: { amountPence: true, notes: true } },
      },
    }),
  ]);

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const fixturePaymentRows = fixtureIds.length
    ? await prisma.playerMatchFee.findMany({
        where: { teamId: teamid, fixtureId: { in: fixtureIds }, status: { not: "CANCELLED" } },
        select: { fixtureId: true, amountPence: true, status: true },
      })
    : [];

  const paymentSummaryByFixtureId = new Map<string, FixturePaymentSummary>();
  const paidPlayerTotalByFixtureId = new Map<string, number>();

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
      paidPlayerTotalByFixtureId.set(fee.fixtureId, (paidPlayerTotalByFixtureId.get(fee.fixtureId) ?? 0) + fee.amountPence);
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

  const teamChargeByFixtureId = new Map<string, (typeof allCharges)[number]>();
  const teamChargeByDate = new Map<string, (typeof allCharges)[number]>();

  function toSummary(charge: (typeof allCharges)[number], relatedFixtureId = charge.fixtureId): TeamChargeSummary {
    const directPaidPence = charge.transactions.reduce((sum, transaction) => {
      if (isPlayerMatchFeeTransaction(transaction)) return sum;
      return sum + transaction.amountPence;
    }, 0);
    const playerPaidPence = relatedFixtureId ? paidPlayerTotalByFixtureId.get(relatedFixtureId) ?? 0 : 0;
    const paidPence = directPaidPence + playerPaidPence;
    const status = getDisplayChargeStatus({ storedStatus: charge.status, amountPence: charge.amountPence, paidPence });

    return {
      amountPence: charge.amountPence,
      paidPence,
      outstandingPence: status === "VOID" || status === "PAID" ? 0 : Math.max(charge.amountPence - paidPence, 0),
      status,
      title: charge.title,
      dueDate: charge.dueDate,
      fixtureId: charge.fixtureId,
    };
  }

  for (const charge of allCharges) {
    if (charge.fixtureId && !teamChargeByFixtureId.has(charge.fixtureId)) teamChargeByFixtureId.set(charge.fixtureId, charge);
  }

  for (const charge of allCharges) {
    const key = dateKey(charge.dueDate);
    if (key && !teamChargeByDate.has(key)) teamChargeByDate.set(key, charge);
  }

  function getChargeForFixture(fixture: (typeof fixtures)[number]) {
    const charge = teamChargeByFixtureId.get(fixture.id) ?? teamChargeByDate.get(dateKey(fixture.kickoffAt) ?? "") ?? null;
    return charge ? toSummary(charge, fixture.id) : null;
  }

  const now = new Date();
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ??
    [...fixtures].sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime()).find((fixture) => fixture.kickoffAt >= now) ??
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
  const openFeeIdsWithoutLinks = fees.filter((fee) => fee.status === "OPEN" && (!fee.paymentToken || !fee.paymentUrl)).map((fee) => fee.id);

  if (openFeeIdsWithoutLinks.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(openFeeIdsWithoutLinks);
    fees = await loadFees();
  }

  const activeFees = fees.filter((fee) => fee.status !== "CANCELLED");
  const selectedMemberIds = new Set(activeFees.filter((fee) => fee.teamMemberId).map((fee) => fee.teamMemberId as string));
  const selectedProspectIds = new Set(activeFees.filter((fee) => fee.prospectId).map((fee) => fee.prospectId as string));
  const feeByMemberId = new Map(activeFees.filter((fee) => fee.teamMemberId).map((fee) => [fee.teamMemberId as string, fee]));
  const feeByProspectId = new Map(activeFees.filter((fee) => fee.prospectId).map((fee) => [fee.prospectId as string, fee]));

  const linkedMemberKeys = new Set(
    members.flatMap((member) => [member.user.email?.trim().toLowerCase(), member.user.name?.trim().toLowerCase()].filter(Boolean) as string[]),
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
  const selectedTeamCharge = selectedFixture ? getChargeForFixture(selectedFixture) : null;
  const selectedTeamChargePaid = isTeamChargePaid(selectedTeamCharge);
  const selectedTeamChargeVoided = selectedTeamCharge?.status === "VOID";
  const selectedTeamChargeAdjusted = isAdjustedTeamCharge({ teamFeePence, teamCharge: selectedTeamCharge });
  const selectedAdjustmentAmount = getAdjustmentAmount({ teamFeePence, teamCharge: selectedTeamCharge });
  const allocation = getAllocationStatus({ allocatedPence: totals.total, teamFeePence });
  const teamFeeStillToCoverPence = selectedTeamChargePaid || selectedTeamChargeVoided ? 0 : selectedTeamCharge?.outstandingPence ?? 0;
  const savedMessage = getSavedMessage(sp.saved);
  const errorMessage = getErrorMessage(sp.error);

  return (
    <div className="space-y-8">
      <SquadPaymentAmountSync />

      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Squad payments</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Collect money from your players</h2>
          <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">Set a default amount, adjust individual player amounts for subs or guests, then share secure Stripe payment links and track who has paid. The team fee status mirrors the team payment ledger after player payments are counted.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/captain/team/${team.id}`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white">Back to captain hub</Link>
            <Link href={`/captain/team/${team.id}/squad`} className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20">Open squad</Link>
          </div>
        </div>
      </section>

      {savedMessage ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Your team fee",
            value: formatMoney(teamFeePence),
            text: selectedTeamChargeAdjusted && selectedTeamCharge ? `Ledger charge adjusted to ${formatMoney(selectedTeamCharge.amountPence)}.` : selectedTeamChargePaid ? "Team charge already paid." : selectedTeamChargeVoided ? "Team charge voided." : selectedTeamCharge ? "Open team charge in ledger." : "No open charge in ledger.",
            tone: selectedTeamChargePaid || selectedTeamChargeVoided || !selectedTeamCharge ? "emerald" as Tone : "white" as Tone,
          },
          {
            label: "Ledger charge",
            value: selectedTeamCharge ? formatMoney(selectedTeamCharge.amountPence) : formatMoney(teamFeePence),
            text: selectedTeamChargeAdjusted ? `${formatMoney(Math.abs(selectedAdjustmentAmount))} ${selectedAdjustmentAmount > 0 ? "removed from" : "added to"} the team fee.` : "Same as team match fee.",
            tone: selectedTeamChargeAdjusted ? "sky" as Tone : "white" as Tone,
          },
          { label: "Collected", value: formatMoney(totals.paid), text: `${paidCount} player payments · ${waivedCount} no-link rows`, tone: "emerald" as Tone },
          { label: "Player payments outstanding", value: formatMoney(totals.open), text: `${openCount} unpaid player${openCount === 1 ? "" : "s"}`, tone: openCount > 0 ? "amber" as Tone : "white" as Tone },
          { label: "Ledger still to cover", value: formatMoney(teamFeeStillToCoverPence), text: selectedTeamChargePaid || selectedTeamChargeVoided || !selectedTeamCharge ? "No action needed." : "Team charge minus paid player fees.", tone: teamFeeStillToCoverPence > 0 ? "red" as Tone : "emerald" as Tone },
        ].map((item) => <div key={item.label} className={`rounded-3xl border p-5 ${getToneClasses(item.tone)}`}><p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</p><p className="mt-3 text-3xl font-semibold text-white">{item.value}</p><p className="mt-2 text-sm text-white/55">{item.text}</p></div>)}
      </section>

      <section className={`rounded-3xl border p-5 text-sm ${getToneClasses(selectedTeamChargePaid || selectedTeamChargeVoided || !selectedTeamCharge ? "emerald" : allocation.tone)}`}>
        <div className="font-semibold text-white">Allocation and payment check</div>
        <p className="mt-2 text-white/70">The team fee is {formatMoney(teamFeePence)}. The amount still to cover is based on the team payment ledger, less paid player match fees. Player allocation is currently {formatMoney(totals.total)} / {formatMoney(teamFeePence)} team fee.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">Published fixtures and existing payment collections are shown. New draft fixtures with no payment history stay hidden.</p>
          <div className="mt-5 space-y-2">
            {fixtures.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No published fixtures or existing payment collections are available for this team yet.</div> : null}
            {fixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              const isPast = fixture.kickoffAt < now;
              const teamCharge = getChargeForFixture(fixture);
              const summary = paymentSummaryByFixtureId.get(fixture.id);
              const stillToCover = teamCharge?.outstandingPence ?? 0;
              return (
                <Link key={fixture.id} href={`/captain/team/${team.id}/player-payments?fixtureId=${fixture.id}`} className={`block rounded-2xl border p-4 transition ${isSelected ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}</div>
                    {isPast ? <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">Past fixture</span> : null}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${stillToCover > 0 ? getFeeStatusClasses("OPEN") : getFeeStatusClasses("PAID")}`}>{stillToCover > 0 ? "Outstanding" : "Covered"}</span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">{formatUkDateTime(fixture.kickoffAt)}{fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}</div>
                  <div className="mt-3 grid gap-1 text-xs text-white/55">
                    <div>Team ledger: {teamCharge ? `${formatMoney(teamCharge.paidPence)} paid / ${formatMoney(teamCharge.amountPence)} charge` : "no charge found"}</div>
                    <div>Player payments: {formatMoney(summary?.paidPence ?? 0)} collected · {formatMoney(summary?.openPence ?? 0)} outstanding</div>
                    <div>Ledger still to cover: {formatMoney(stillToCover)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Create / update collection</h2>
          <p className="mt-1 text-sm text-white/55">Set a default amount, then adjust any individual player amount. Use the collection method options for payment links, direct captain payments, or waived players.</p>
          {selectedFixture ? (
            <form action={createCaptainSquadPaymentCollectionAction} className="mt-5 space-y-5">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="fixtureId" value={selectedFixture.id} />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">{getFixtureLabel({ homeTeamName: selectedFixture.homeTeam.name, awayTeamName: selectedFixture.awayTeam.name })}</div>
                <div className="mt-1 text-xs text-white/50">{formatUkDateTime(selectedFixture.kickoffAt)}{selectedFixture.venue?.name ? ` · ${selectedFixture.venue.name}` : ""}</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-white/60">Default amount per player</label>
                  <div className="relative mt-2">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/45">£</span>
                    <input type="number" name="defaultAmountPounds" min="0.01" step="0.01" defaultValue={(defaultAmount / 100).toFixed(2)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 pl-8 text-white outline-none focus:border-emerald-400/40" />
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  Team fee: <span className="font-semibold text-white">{formatMoney(teamFeePence)}</span><br />
                  Current player allocation: <span className="font-semibold text-white">{formatMoney(totals.total)}</span><br />
                  Paid player payments count against the team ledger.
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-white">Players</div>
                {[...members.map((member) => ({ kind: "member" as const, id: member.id, label: member.user.name || member.user.email || "Unnamed member", contact: member.user.email, checked: selectedMemberIds.has(member.id), fee: feeByMemberId.get(member.id) })), ...selectableProspects.map((prospect) => ({ kind: "prospect" as const, id: prospect.id, label: [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || prospect.email || prospect.phone || "Unnamed prospect", contact: getPlayerContact({ prospectEmail: prospect.email, prospectPhone: prospect.phone }), checked: selectedProspectIds.has(prospect.id), fee: feeByProspectId.get(prospect.id) }))].map((player) => (
                  <div key={`${player.kind}-${player.id}`} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[minmax(0,1fr)_150px_170px] md:items-center">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name={player.kind === "member" ? "teamMemberIds" : "prospectIds"} value={player.id} defaultChecked={player.checked} className="mt-1" />
                      <span>
                        <span className="block text-sm font-semibold text-white">{player.label}</span>
                        <span className="mt-1 block text-xs text-white/45">{player.contact || "No contact saved"}</span>
                      </span>
                    </label>
                    <div>
                      <label className="sr-only">Player amount</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/45">£</span>
                        <input type="number" name={`${player.kind}-${player.id}-amountPounds`} min="0" step="0.01" defaultValue={player.fee ? (player.fee.amountPence / 100).toFixed(2) : ""} placeholder="Default" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pl-7 text-sm text-white outline-none focus:border-emerald-400/40" />
                      </div>
                    </div>
                    <select name={`${player.kind}-${player.id}-collectionMethod`} defaultValue={player.fee?.status === "PAID" ? "CAPTAIN_PAID" : player.fee?.status === "WAIVED" ? "WAIVED" : "PAYMENT_LINK"} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/40">
                      <option value="PAYMENT_LINK">Send payment link</option>
                      <option value="CAPTAIN_PAID">Captain already collected</option>
                      <option value="WAIVED">Waive / no link</option>
                    </select>
                  </div>
                ))}
              </div>

              <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">Save collection</button>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">Choose a published fixture or existing payment collection first.</div>
          )}
        </div>
      </section>

      {activeFees.length > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Current collection rows</h2>
          <div className="mt-4 divide-y divide-white/10">
            {activeFees.map((fee) => (
              <div key={fee.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-white">{getPlayerName(fee)}</div>
                  <div className="mt-1 text-xs text-white/45">{formatMoney(fee.amountPence)}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${getFeeStatusClasses(fee.status)}`}>{getFeeStatusLabel(fee.status)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
