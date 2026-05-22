// ========================================
// File: src/app/captain/team/[teamid]/match-fees/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import type { PlayerMatchFeeStatus } from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  createCaptainPlayerMatchFeesAction,
  markCaptainPlayerMatchFeePaidAction,
  sendCaptainPlayerMatchFeeReminderAction,
  updateCaptainPlayerMatchFeeAmountAction,
  updateCaptainPlayerMatchFeeStatusAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Matchday Squad | SIXFL",
};

const DEFAULT_PLAYER_MATCH_FEE_PENCE = 600;

type Props = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ fixtureId?: string; saved?: string; error?: string }>;
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

function getFeeStatusLabel(status: PlayerMatchFeeStatus) {
  switch (status) {
    case "PAID":
      return "Paid";
    case "WAIVED":
      return "Waived";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Open";
  }
}

function getAvailabilityLabel(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

function getAvailabilityClasses(response?: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/55";
  }
}

function getSavedMessage(saved: string | undefined, isAdmin: boolean) {
  switch (saved) {
    case "fees_created":
      return isAdmin
        ? "Matchday squad and player fee rows refreshed."
        : "Matchday squad submitted to SIXFL.";
    case "fee_updated":
      return "Player match fee updated.";
    case "fee_sms_queued":
      return "Player match fee reminder queued.";
    case "fee_sms_already_sent":
      return "A player match fee reminder has already been queued or sent for each reminder stage.";
    default:
      return null;
  }
}

function getErrorMessage(error?: string) {
  switch (error) {
    case "missing_fixture":
      return "Choose a fixture first.";
    case "invalid_amount":
      return "Enter a valid match fee amount.";
    case "no_players":
      return "Select at least one player.";
    case "fixture_not_found":
      return "That fixture could not be found for this team.";
    case "missing_fee":
      return "That player fee could not be found.";
    case "invalid_status":
      return "That fee status is not valid.";
    case "admin_only":
      return "Only SIXFL admin can update payment details.";
    case "fee_not_open":
    case "not_open":
      return "Only open player fees can be chased.";
    case "no_contact":
      return "No phone number was found for that player.";
    case "no_payment_url":
      return "A payment link could not be created for that player fee.";
    default:
      return null;
  }
}

function getPlayerName(fee: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
}) {
  if (fee.teamMember) {
    return fee.teamMember.user.name || fee.teamMember.user.email || "Unnamed member";
  }

  if (fee.prospect) {
    return (
      [fee.prospect.firstName, fee.prospect.lastName].filter(Boolean).join(" ") ||
      fee.prospect.email ||
      fee.prospect.phone ||
      "Unnamed prospect"
    );
  }

  return "Unknown player";
}

function getPlayerContact(fee: {
  teamMember: { user: { email: string | null } } | null;
  prospect: { email: string | null; phone: string | null } | null;
}) {
  if (fee.teamMember) return fee.teamMember.user.email || "No email";
  if (fee.prospect) return [fee.prospect.email, fee.prospect.phone].filter(Boolean).join(" · ") || "No contact";
  return "No contact";
}

export default async function CaptainManagedPlayerMatchFeesPage({
  params,
  searchParams,
}: Props) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const isAdmin = access.isAdmin && access.accessMode !== "admin-preview";

  const sp = (await searchParams) ?? {};
  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      teamMode: true,
      matchdayTargetSize: true,
      league: { select: { id: true, name: true, season: true } },
    },
  });

  if (!team) notFound();

  const [fixtures, members, prospects] = await Promise.all([
    prisma.fixture.findMany({
      where: { OR: [{ homeTeamId: teamid }, { awayTeamId: teamid }] },
      orderBy: [{ kickoffAt: "asc" }],
      take: 30,
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
        updatedAt: true,
      },
    }),
  ]);

  const submittedFixtureRows = await prisma.playerMatchFee.findMany({
    where: {
      teamId: teamid,
      status: {
        not: "CANCELLED",
      },
    },
    distinct: ["fixtureId"],
    select: {
      fixtureId: true,
    },
  });

  const submittedFixtureIds = new Set(submittedFixtureRows.map((row) => row.fixtureId));
  const now = new Date();
  const visibleFixtures = isAdmin
    ? fixtures
    : fixtures.filter((fixture) => fixture.kickoffAt >= now || !submittedFixtureIds.has(fixture.id));

  const linkedMemberKeys = new Set(
    members.flatMap((member) => [member.user.email?.trim().toLowerCase(), member.user.name?.trim().toLowerCase()].filter(Boolean) as string[]),
  );

  const selectableProspects = prospects.filter((prospect) => {
    const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim().toLowerCase();
    const email = prospect.email?.trim().toLowerCase();
    return !((email && linkedMemberKeys.has(email)) || (fullName && linkedMemberKeys.has(fullName)));
  });

  const selectedFixture =
    visibleFixtures.find((fixture) => fixture.id === sp.fixtureId) ??
    visibleFixtures.find((fixture) => fixture.kickoffAt >= now) ??
    visibleFixtures[0] ??
    null;

  const [fees, selectedFixtureAvailabilities] = selectedFixture
    ? await Promise.all([
        prisma.playerMatchFee.findMany({
          where: { teamId: teamid, fixtureId: selectedFixture.id },
          orderBy: [{ createdAt: "asc" }],
          include: {
            teamMember: {
              include: { user: { select: { name: true, email: true } } },
            },
            prospect: {
              select: { firstName: true, lastName: true, email: true, phone: true },
            },
          },
        }),
        prisma.fixtureAvailability.findMany({
          where: {
            fixtureId: selectedFixture.id,
            teamMember: {
              teamId: teamid,
            },
          },
          select: {
            teamMemberId: true,
            response: true,
            note: true,
            respondedAt: true,
          },
        }),
      ])
    : [[], []];

  const availabilityByMemberId = new Map(
    selectedFixtureAvailabilities.map((availability) => [availability.teamMemberId, availability]),
  );

  const availabilityCounts = {
    available: selectedFixtureAvailabilities.filter((item) => item.response === "AVAILABLE").length,
    maybe: selectedFixtureAvailabilities.filter((item) => item.response === "MAYBE").length,
    unavailable: selectedFixtureAvailabilities.filter((item) => item.response === "UNAVAILABLE").length,
  };
  const noResponseCount = Math.max(members.length - selectedFixtureAvailabilities.filter((item) => item.response !== "NO_RESPONSE").length, 0);

  const activeFees = fees.filter((fee) => fee.status !== "CANCELLED");
  const feeByMemberId = new Map(
    activeFees.filter((fee) => Boolean(fee.teamMemberId)).map((fee) => [fee.teamMemberId as string, fee]),
  );
  const feeByProspectId = new Map(
    activeFees.filter((fee) => Boolean(fee.prospectId)).map((fee) => [fee.prospectId as string, fee]),
  );

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

  const cashTotal = activeFees.reduce(
    (sum, fee) => sum + (fee.status === "PAID" && fee.note?.includes("Paid cash") ? fee.amountPence : 0),
    0,
  );
  const onlineTotal = activeFees.reduce(
    (sum, fee) => sum + (fee.status === "PAID" && fee.note?.includes("Paid online") ? fee.amountPence : 0),
    0,
  );
  const paidCount = activeFees.filter((fee) => fee.status === "PAID").length;
  const openCount = activeFees.filter((fee) => fee.status === "OPEN").length;
  const waivedCount = activeFees.filter((fee) => fee.status === "WAIVED").length;
  const expectedTotal = activeFees.length * DEFAULT_PLAYER_MATCH_FEE_PENCE;
  const selectedCount = activeFees.length;
  const targetSize = team.matchdayTargetSize ?? 0;
  const hasSelection = selectedCount > 0;
  const isShortOfTarget = targetSize > 0 && selectedCount > 0 && selectedCount < targetSize;
  const isOverTarget = targetSize > 0 && selectedCount > targetSize;
  const hasAmountMismatch = activeFees.length > 0 && totals.total !== expectedTotal;
  const savedMessage = getSavedMessage(sp.saved, isAdmin);
  const errorMessage = getErrorMessage(sp.error);

  const adminWarnings = [
    !hasSelection
      ? "No matchday squad has been submitted for this fixture yet. Do not reconcile player fees until the squad is confirmed."
      : null,
    isShortOfTarget
      ? `Captain selected ${selectedCount} player${selectedCount === 1 ? "" : "s"}, below the target squad size of ${targetSize}. Check whether anyone played but was missed.`
      : null,
    isOverTarget
      ? `Captain selected ${selectedCount} players, above the target squad size of ${targetSize}. Check whether any backup or extra players should be charged.`
      : null,
    hasAmountMismatch
      ? `Fee total does not match the £6 default. Expected ${formatMoney(expectedTotal)} for ${selectedCount} selected player${selectedCount === 1 ? "" : "s"}; current fee total is ${formatMoney(totals.total)}.`
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Matchday squad
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Player selection
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
            {isAdmin
              ? "Admin view: check who has been selected for the fixture, review the expected £6 player fee total and reconcile payments."
              : "Select the players who actually played in this fixture. SIXFL will use this to manage match fees and records."}
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

      {team.teamMode !== "MANAGED" ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
          This team is currently set as a standard team. Matchday player selection is intended for managed SIXFL squads.
        </div>
      ) : null}
      {savedMessage ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div> : null}

      {isAdmin ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Selected", value: selectedCount, text: targetSize > 0 ? `Target squad size: ${targetSize}` : "Players selected for this fixture.", classes: "border-white/10 bg-white/[0.04] text-white/45" },
              { label: "Expected", value: formatMoney(expectedTotal), text: "Selected players × £6.00.", classes: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70" },
              { label: "Outstanding", value: openCount, text: formatMoney(totals.open), classes: "border-amber-400/20 bg-amber-500/10 text-amber-100/70" },
              { label: "Waived", value: waivedCount, text: formatMoney(totals.waived), classes: "border-sky-400/20 bg-sky-500/10 text-sky-100/70" },
            ].map((item) => (
              <div key={item.label} className={`rounded-3xl border p-5 ${item.classes}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-sm text-white/55">{item.text}</p>
              </div>
            ))}
          </section>

          {adminWarnings.length > 0 ? (
            <section className="rounded-3xl border border-amber-400/25 bg-amber-500/10 p-5 text-amber-100">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Reconciliation warning
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Check this fixture before taking payment action</h2>
              <div className="mt-4 space-y-2 text-sm text-amber-100/80">
                {adminWarnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            </section>
          ) : (
            <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-sm text-emerald-100">
              Selection and expected £6 player fee total look aligned for this fixture.
            </section>
          )}

          {activeFees.length > 0 ? (
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Paid</p>
                <p className="mt-3 text-2xl font-semibold text-white">{paidCount}</p>
                <p className="mt-2 text-sm text-white/50">{formatMoney(totals.paid)}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Cash collected</p>
                <p className="mt-3 text-2xl font-semibold text-white">{formatMoney(cashTotal)}</p>
                <p className="mt-2 text-sm text-white/50">Marked using the Paid cash button.</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Online/manual collected</p>
                <p className="mt-3 text-2xl font-semibold text-white">{formatMoney(onlineTotal)}</p>
                <p className="mt-2 text-sm text-white/50">Marked using the Paid online button.</p>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">
            {isAdmin
              ? "Pick the fixture you are selecting players for. Admin can open past fixtures."
              : "Past fixtures already submitted to SIXFL are hidden from this captain view."}
          </p>
          <div className="mt-5 space-y-2">
            {visibleFixtures.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No editable fixtures are available for this team.</div> : null}
            {visibleFixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              const isPast = fixture.kickoffAt < now;
              return (
                <Link
                  key={fixture.id}
                  href={`/captain/team/${team.id}/match-fees?fixtureId=${fixture.id}`}
                  className={`block rounded-2xl border p-4 transition ${isSelected ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}</div>
                    {isPast ? <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">Past fixture</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {formatUkDateTime(fixture.kickoffAt)}{fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                  </div>
                  {selectedFixture?.id === fixture.id && activeFees.length > 0 ? (
                    <div className="mt-2 text-xs text-emerald-100/75">
                      {activeFees.length} player{activeFees.length === 1 ? "" : "s"} currently selected
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Select players</h2>
          <p className="mt-1 text-sm text-white/55">
            {isAdmin
              ? "Select who played. Fee rows are created at £6 per selected player unless you change the admin amount below."
              : "Tick every player who actually played. Availability responses are shown to help you pick the squad."}
          </p>
          {selectedFixture ? (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  Available {availabilityCounts.available}
                </span>
                <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
                  Maybe {availabilityCounts.maybe}
                </span>
                <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-100">
                  Unavailable {availabilityCounts.unavailable}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60">
                  No response {noResponseCount}
                </span>
              </div>
              <form action={createCaptainPlayerMatchFeesAction} className="mt-5 space-y-5">
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="fixtureId" value={selectedFixture.id} />
                {!isAdmin ? <input type="hidden" name="amount" value="6.00" /> : null}

                {isAdmin ? (
                  <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                    <div className="space-y-2">
                      <label htmlFor="amount" className="text-sm text-white/60">Fee per player</label>
                      <input id="amount" name="amount" type="text" inputMode="decimal" defaultValue="6.00" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="note" className="text-sm text-white/60">Admin note</label>
                      <input id="note" name="note" type="text" placeholder="Optional internal note" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60" />
                    </div>
                  </div>
                ) : null}

                <div className={`grid gap-4 ${selectableProspects.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="font-semibold text-white">Linked squad members</h3>
                    <div className="mt-3 space-y-2">
                      {members.length === 0 ? <div className="text-sm text-white/45">No linked members yet.</div> : null}
                      {members.map((member) => {
                        const existingFee = feeByMemberId.get(member.id);
                        const availability = availabilityByMemberId.get(member.id);
                        return (
                          <label key={member.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                            <input type="checkbox" name="player" value={`member:${member.id}`} defaultChecked={Boolean(existingFee)} className="mt-1" />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="block font-medium text-white">{member.user.name || member.user.email || "Unnamed member"}</span>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${getAvailabilityClasses(availability?.response)}`}>
                                  {getAvailabilityLabel(availability?.response)}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs text-white/45">
                                {isAdmin ? member.user.email || "No email" : "Squad player"}{existingFee && isAdmin ? ` · ${getFeeStatusLabel(existingFee.status)}` : ""}
                              </span>
                              {availability?.note ? (
                                <span className="mt-1 block text-xs text-white/45">Note: {availability.note}</span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {selectableProspects.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <h3 className="font-semibold text-white">Unlinked extra players</h3>
                      <p className="mt-1 text-xs text-white/45">Only use this for someone who played but is not yet in the linked squad list.</p>
                      <div className="mt-3 space-y-2">
                        {selectableProspects.map((prospect) => {
                          const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();
                          const existingFee = feeByProspectId.get(prospect.id);
                          return (
                            <label key={prospect.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                              <input type="checkbox" name="player" value={`prospect:${prospect.id}`} defaultChecked={Boolean(existingFee)} className="mt-1" />
                              <span>
                                <span className="block font-medium text-white">{fullName || prospect.email || prospect.phone || "Unnamed prospect"}</span>
                                <span className="block text-xs text-white/45">
                                  {isAdmin
                                    ? `${prospect.email || "No email"}${prospect.phone ? ` · ${prospect.phone}` : ""}`
                                    : "Not yet linked to the squad"}
                                  {existingFee && isAdmin ? ` · ${getFeeStatusLabel(existingFee.status)}` : ""}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <button type="submit" className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400">
                  {isAdmin ? "Create / refresh fee rows" : "Submit matchday squad"}
                </button>
              </form>
            </>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">Create or select a fixture before selecting players.</div>
          )}
        </div>
      </section>

      {isAdmin ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Admin fee tracker</h2>
              <p className="mt-1 text-sm text-white/55">Admin-only reconciliation for the selected fixture. Use Paid cash or Paid online so the night can be reconciled properly.</p>
            </div>
            {selectedFixture ? <div className="text-sm text-white/55">{getFixtureLabel({ homeTeamName: selectedFixture.homeTeam.name, awayTeamName: selectedFixture.awayTeam.name })}</div> : null}
          </div>

          <div className="mt-5 space-y-3">
            {fees.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">No players have been selected for this fixture yet.</div> : null}
            {fees.map((fee) => {
              const playerName = getPlayerName(fee);
              const playerContact = getPlayerContact(fee);
              const statusButtons = ["OPEN", "WAIVED", "CANCELLED"] as PlayerMatchFeeStatus[];

              return (
                <div key={fee.id} className={`grid gap-4 rounded-2xl border border-white/10 p-4 lg:grid-cols-[1fr_auto] lg:items-center ${fee.status === "CANCELLED" ? "bg-red-500/[0.04] opacity-70" : "bg-black/20"}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white">{playerName}</div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getFeeStatusClasses(fee.status)}`}>{getFeeStatusLabel(fee.status)}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">{formatMoney(fee.amountPence)}</span>
                    </div>
                    <div className="mt-1 text-sm text-white/50">{playerContact}</div>
                    <div className="mt-1 text-xs text-white/35">
                      Created {formatUkDateTime(fee.createdAt)}{fee.paidAt ? ` · Paid ${formatUkDateTime(fee.paidAt)}` : ""}{fee.waivedAt ? ` · Waived ${formatUkDateTime(fee.waivedAt)}` : ""}{fee.cancelledAt ? ` · Cancelled ${formatUkDateTime(fee.cancelledAt)}` : ""}
                    </div>
                    {fee.note ? <div className="mt-2 whitespace-pre-line rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/55">{fee.note}</div> : null}
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <form action={updateCaptainPlayerMatchFeeAmountAction} className="flex gap-2">
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                      <input type="hidden" name="feeId" value={fee.id} />
                      <input name="amount" type="text" inputMode="decimal" defaultValue={(fee.amountPence / 100).toFixed(2)} className="w-24 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/60" />
                      <button type="submit" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10">Update</button>
                    </form>

                    <form action={markCaptainPlayerMatchFeePaidAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                      <input type="hidden" name="feeId" value={fee.id} />
                      <input type="hidden" name="method" value="CASH" />
                      <button type="submit" disabled={fee.status === "PAID" && fee.note?.includes("Paid cash")} className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40">Paid cash</button>
                    </form>

                    <form action={markCaptainPlayerMatchFeePaidAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                      <input type="hidden" name="feeId" value={fee.id} />
                      <input type="hidden" name="method" value="ONLINE" />
                      <button type="submit" disabled={fee.status === "PAID" && fee.note?.includes("Paid online")} className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40">Paid online</button>
                    </form>

                    <form action={sendCaptainPlayerMatchFeeReminderAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                      <input type="hidden" name="feeId" value={fee.id} />
                      <button type="submit" disabled={fee.status !== "OPEN"} className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40">Send reminder</button>
                    </form>

                    {statusButtons.map((status) => (
                      <form key={status} action={updateCaptainPlayerMatchFeeStatusAction}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                        <input type="hidden" name="feeId" value={fee.id} />
                        <input type="hidden" name="status" value={status} />
                        <button type="submit" disabled={fee.status === status} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
                          {getFeeStatusLabel(status)}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
