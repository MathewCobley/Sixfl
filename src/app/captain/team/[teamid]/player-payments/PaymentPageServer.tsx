// ========================================
// File: src/app/captain/team/[teamid]/player-payments/PaymentPageServer.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  formatPaymentMoney,
  getTeamPaymentLedger,
} from "@/lib/payments/team-payment-ledger";
import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { createCaptainSquadPaymentCollectionAction } from "./actions";

type Props = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{ fixtureId?: string; saved?: string; error?: string }>;
};

type Tone = "white" | "emerald" | "amber" | "red";

function formatDateTime(value: Date | null) {
  if (!value) return "No date set";
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(amountPence: number) {
  return formatPaymentMoney(amountPence);
}

function toneClasses(tone: Tone) {
  if (tone === "emerald") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70";
  if (tone === "amber") return "border-amber-400/25 bg-amber-500/10 text-amber-100/70";
  if (tone === "red") return "border-red-400/20 bg-red-500/10 text-red-100/70";
  return "border-white/10 bg-white/[0.04] text-white/45";
}

function statusClasses(status: string) {
  if (status === "PAID") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === "WAIVED") return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  if (status === "CANCELLED") return "border-red-400/25 bg-red-500/10 text-red-100";
  return "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function statusLabel(status: string) {
  if (status === "PAID") return "Paid";
  if (status === "WAIVED") return "Waived";
  if (status === "CANCELLED") return "Cancelled";
  return "Unpaid";
}

function fixtureTitle(fixture: { homeTeam: { name: string }; awayTeam: { name: string } }) {
  return `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
}

function playerName(fee: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
}) {
  if (fee.teamMember) return fee.teamMember.user.name || fee.teamMember.user.email || "Unnamed member";
  if (fee.prospect) return [fee.prospect.firstName, fee.prospect.lastName].filter(Boolean).join(" ") || fee.prospect.email || fee.prospect.phone || "Unnamed player";
  return "Unknown player";
}

function playerContact(input: { memberEmail?: string | null; prospectEmail?: string | null; prospectPhone?: string | null }) {
  return [input.memberEmail, input.prospectEmail, input.prospectPhone].filter(Boolean).join(" · ") || "No contact saved";
}

function collectionMethod(status?: string | null, amountPence?: number | null) {
  if (status === "PAID") return "captain_paid";
  if (status === "WAIVED" || amountPence === 0) return "waived";
  return "link";
}

function messageForSaved(saved?: string) {
  return saved === "collection_created" ? "Squad payment collection updated." : null;
}

function messageForError(error?: string) {
  if (error === "missing_fixture") return "Choose a fixture first.";
  if (error === "invalid_amount") return "Enter a valid default amount per player.";
  if (error === "invalid_player_amount") return "One player amount is invalid.";
  if (error === "no_players") return "Select at least one player.";
  if (error === "fixture_not_found") return "That fixture could not be found for this team.";
  return null;
}

export default async function PaymentPageServer({ params, searchParams }: Props) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const sp = (await searchParams) ?? {};

  const team = await prisma.team.findUnique({ where: { id: teamid }, select: { id: true, name: true } });
  if (!team) notFound();

  const ledger = await getTeamPaymentLedger(teamid);
  const relatedTeamIds = ledger?.relatedTeamIds ?? [teamid];
  const selectedLedgerEntry =
    (sp.fixtureId ? ledger?.entries.find((entry) => entry.fixtureId === sp.fixtureId) : null) ??
    ledger?.selectedEntry ??
    null;

  const [fixtures, members, prospects] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        status: { in: ["SCHEDULED", "COMPLETED"] },
        AND: [
          { OR: [{ homeTeamId: { in: relatedTeamIds } }, { awayTeamId: { in: relatedTeamIds } }] },
          {
            OR: [
              { publishedAt: { not: null } },
              { playerMatchFees: { some: { teamId: { in: relatedTeamIds }, status: { not: "CANCELLED" } } } },
              { paymentCharges: { some: { teamId: { in: relatedTeamIds }, status: { not: "VOID" } } } },
            ],
          },
        ],
      },
      orderBy: [{ kickoffAt: "desc" }],
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
        venue: { select: { name: true } },
      },
      take: 60,
    }),
    prisma.teamMember.findMany({
      where: { teamId: teamid },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.teamPlayerProspect.findMany({
      where: { teamId: teamid, status: { in: ["QUALIFIED", "CONTACTED", "NEW"] } },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    }),
  ]);

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const selectedFixture =
    (sp.fixtureId ? fixtureById.get(sp.fixtureId) ?? null : null) ??
    (selectedLedgerEntry?.fixtureId ? fixtureById.get(selectedLedgerEntry.fixtureId) ?? null : null) ??
    fixtures[0] ??
    null;
  const selectedEntry =
    (selectedFixture ? ledger?.entries.find((entry) => entry.fixtureId === selectedFixture.id) ?? null : null) ??
    selectedLedgerEntry;
  const selectedFixtureEditable = Boolean(selectedFixture && (selectedFixture.homeTeamId === teamid || selectedFixture.awayTeamId === teamid));

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const fees = fixtureIds.length
    ? await prisma.playerMatchFee.findMany({
        where: { teamId: { in: relatedTeamIds }, fixtureId: { in: fixtureIds }, status: { not: "CANCELLED" } },
        orderBy: [{ createdAt: "asc" }],
        include: {
          teamMember: { include: { user: { select: { name: true, email: true } } } },
          prospect: { select: { firstName: true, lastName: true, email: true, phone: true } },
        },
      })
    : [];

  const selectedFees = selectedFixture ? fees.filter((fee) => fee.fixtureId === selectedFixture.id) : [];
  const missingLinkIds = selectedFees.filter((fee) => fee.status === "OPEN" && (!fee.paymentToken || !fee.paymentUrl)).map((fee) => fee.id);
  if (missingLinkIds.length > 0) await ensurePlayerMatchFeePaymentDetailsForFees(missingLinkIds);

  const currentTeamFees = selectedFees.filter((fee) => fee.teamId === teamid);
  const selectedMemberIds = new Set(currentTeamFees.filter((fee) => fee.teamMemberId).map((fee) => fee.teamMemberId as string));
  const selectedProspectIds = new Set(currentTeamFees.filter((fee) => fee.prospectId).map((fee) => fee.prospectId as string));
  const feeByMemberId = new Map(currentTeamFees.filter((fee) => fee.teamMemberId).map((fee) => [fee.teamMemberId as string, fee]));
  const feeByProspectId = new Map(currentTeamFees.filter((fee) => fee.prospectId).map((fee) => [fee.prospectId as string, fee]));
  const linkedMemberKeys = new Set(members.flatMap((member) => [member.user.email?.toLowerCase(), member.user.name?.toLowerCase()].filter(Boolean) as string[]));
  const selectableProspects = prospects.filter((prospect) => {
    const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim().toLowerCase();
    const email = prospect.email?.trim().toLowerCase();
    return !((email && linkedMemberKeys.has(email)) || (fullName && linkedMemberKeys.has(fullName)));
  });
  const playersForForm = [
    ...members.map((member) => ({ kind: "member" as const, id: member.id, value: `member:${member.id}`, label: member.user.name || member.user.email || "Unnamed member", contact: member.user.email, checked: selectedMemberIds.has(member.id), fee: feeByMemberId.get(member.id) })),
    ...selectableProspects.map((prospect) => ({ kind: "prospect" as const, id: prospect.id, value: `prospect:${prospect.id}`, label: [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") || prospect.email || prospect.phone || "Unnamed prospect", contact: playerContact({ prospectEmail: prospect.email, prospectPhone: prospect.phone }), checked: selectedProspectIds.has(prospect.id), fee: feeByProspectId.get(prospect.id) })),
  ];

  const defaultAmount = currentTeamFees.find((fee) => fee.status !== "PAID")?.amountPence ?? 400;
  const selectedPaidPlayerCount = selectedFees.filter((fee) => fee.status === "PAID").length;
  const selectedOpenPlayerCount = selectedFees.filter((fee) => fee.status === "OPEN").length;
  const selectedWaivedCount = selectedFees.filter((fee) => fee.status === "WAIVED").length;
  const playerAllocationPence = selectedFees.reduce((sum, fee) => sum + fee.amountPence, 0);
  const ledgerChargePence = selectedEntry?.amountPence ?? 0;
  const selectedTeamFeePence = selectedEntry?.amountPence ?? selectedFixture?.matchFeePence ?? 4000;
  const collectedPence = selectedEntry?.playerPaidPence ?? 0;
  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;
  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;
  const savedMessage = messageForSaved(sp.saved);
  const errorMessage = messageForError(sp.error);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6 lg:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Squad payments</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Collect money from your players</h2>
        <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">Split the fixture team fee between players. Player payments reduce the matching fixture/team ledger charge.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/captain/team/${team.id}`} className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80">Back to captain hub</Link>
          <Link href={`/captain/team/${team.id}/squad`} className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50">Open squad</Link>
        </div>
      </section>

      {savedMessage ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Your team fee", value: formatMoney(selectedTeamFeePence), text: selectedEntry ? "Open team charge in ledger." : "No open charge in ledger.", tone: selectedEntry ? "white" as Tone : "emerald" as Tone },
          { label: "Ledger charge", value: formatMoney(ledgerChargePence), text: selectedEntry ? "From the team payment ledger." : "No ledger charge found.", tone: "white" as Tone },
          { label: "Collected", value: formatMoney(collectedPence), text: `${selectedPaidPlayerCount} player payments · ${selectedWaivedCount} no-link rows`, tone: "emerald" as Tone },
          { label: "Player payments outstanding", value: formatMoney(playerOutstandingPence), text: `${selectedOpenPlayerCount} unpaid player${selectedOpenPlayerCount === 1 ? "" : "s"}`, tone: playerOutstandingPence > 0 ? "amber" as Tone : "white" as Tone },
          { label: "Ledger still to cover", value: formatMoney(stillToCoverPence), text: selectedEntry ? "Team charge minus counted payments." : "No action needed.", tone: stillToCoverPence > 0 ? "red" as Tone : "emerald" as Tone },
        ].map((item) => <div key={item.label} className={`rounded-3xl border p-5 ${toneClasses(item.tone)}`}><p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</p><p className="mt-3 text-3xl font-semibold text-white">{item.value}</p><p className="mt-2 text-sm text-white/55">{item.text}</p></div>)}
      </section>

      <section className={`rounded-3xl border p-5 text-sm ${toneClasses(stillToCoverPence > 0 ? "red" : "emerald")}`}>
        <div className="font-semibold text-white">Allocation and payment check</div>
        <p className="mt-2 text-white/70">The ledger charge is {formatMoney(ledgerChargePence)}. Player allocation for the selected fixture is {formatMoney(playerAllocationPence)}. The ledger still to cover is {formatMoney(stillToCoverPence)}.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">Fixture-linked team charges and existing payment collections are shown across seasons.</p>
          <div className="mt-5 space-y-2">
            {(ledger?.entries ?? []).length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No payment charges or collections are available for this team yet.</div> : null}
            {(ledger?.entries ?? []).map((entry) => {
              const href = entry.fixtureId ? `/captain/team/${team.id}/player-payments?fixtureId=${entry.fixtureId}` : `/captain/team/${team.id}/player-payments`;
              const selected = selectedEntry?.chargeId === entry.chargeId;
              const meta = [entry.leagueSeason, entry.divisionName, entry.venueName].filter(Boolean).join(" · ");
              return (
                <Link key={entry.chargeId} href={href} className={`block rounded-2xl border p-4 transition ${selected ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"}`}>
                  <div className="flex flex-wrap items-center gap-2"><div className="text-sm font-semibold">{entry.fixtureLabel}</div><span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${entry.outstandingPence > 0 ? statusClasses("OPEN") : statusClasses("PAID")}`}>{entry.outstandingPence > 0 ? "Outstanding" : "Covered"}</span></div>
                  <div className="mt-1 text-xs text-white/50">{formatDateTime(entry.kickoffAt ?? entry.dueDate)}{meta ? ` · ${meta}` : ""}</div>
                  <div className="mt-3 grid gap-1 text-xs text-white/55"><div>Team ledger: {formatMoney(entry.paidPence)} paid / {formatMoney(entry.amountPence)} charge</div><div>Player payments: {formatMoney(entry.playerPaidPence)} collected · {formatMoney(entry.playerOpenPence)} outstanding</div><div>Ledger still to cover: {formatMoney(entry.outstandingPence)}</div></div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Create / update collection</h2>
          <p className="mt-1 text-sm text-white/55">Create player links only for fixtures attached to this current team record. Historical ledger charges stay visible but are settled through Team payments.</p>
          {selectedFixture && selectedFixtureEditable ? (
            <form action={createCaptainSquadPaymentCollectionAction} className="mt-5 space-y-5">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="fixtureId" value={selectedFixture.id} />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-sm font-semibold text-white">{fixtureTitle(selectedFixture)}</div><div className="mt-1 text-xs text-white/50">{formatDateTime(selectedFixture.kickoffAt)}{selectedFixture.venue?.name ? ` · ${selectedFixture.venue.name}` : ""}</div></div>
              <div><label className="text-sm text-white/60" htmlFor="amount">Default amount per player</label><div className="relative mt-2"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/45">£</span><input id="amount" type="number" name="amount" min="0.01" step="0.01" defaultValue={(defaultAmount / 100).toFixed(2)} className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 pl-8 text-white outline-none focus:border-emerald-400/40" /></div></div>
              <div className="space-y-3"><div className="text-sm font-semibold text-white">Players</div>{playersForForm.map((player) => { const amountName = `amount_${player.kind}_${player.id}`; const collectionName = `collection_${player.kind}_${player.id}`; const method = collectionMethod(player.fee?.status, player.fee?.amountPence); return <div key={`${player.kind}-${player.id}`} className="rounded-2xl border border-white/10 bg-black/20 p-4"><label className="flex items-start gap-3"><input type="checkbox" name="player" value={player.value} defaultChecked={player.checked} className="mt-1" /><span><span className="block text-sm font-semibold text-white">{player.label}</span><span className="mt-1 block text-xs text-white/45">{player.contact || "No contact saved"}</span></span></label><div className="mt-3 grid gap-3 md:grid-cols-[150px_1fr]"><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/45">£</span><input type="number" name={amountName} min="0" step="0.01" defaultValue={player.fee ? (player.fee.amountPence / 100).toFixed(2) : ""} placeholder="Default" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pl-7 text-sm text-white outline-none focus:border-emerald-400/40" /></div><div className="grid gap-2 text-xs text-white/70 md:grid-cols-3">{[["link", "Send payment link"], ["captain_paid", "Paid SIXFL via DD"], ["waived", "Waive / no link"]].map(([value, label]) => <label key={value} className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-2"><input type="radio" name={collectionName} value={value} defaultChecked={method === value} /><span>{label}</span></label>)}</div></div></div>; })}</div>
              <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">Save collection</button>
            </form>
          ) : selectedEntry ? (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100/80">This is a historical or migrated ledger charge for {selectedEntry.fixtureLabel}. Use Team payments to settle the remaining {formatMoney(selectedEntry.outstandingPence)}.</div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">Choose a published current-team fixture first.</div>
          )}
        </div>
      </section>

      {selectedFees.length > 0 ? <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><h2 className="text-lg font-semibold text-white">Current collection rows</h2><div className="mt-4 divide-y divide-white/10">{selectedFees.map((fee) => <div key={fee.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"><div><div className="font-semibold text-white">{playerName(fee)}</div><div className="mt-1 text-xs text-white/45">{formatMoney(fee.amountPence)} · {fee.teamId === teamid ? "Current team" : "Historical team row"}</div></div><span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(fee.status)}`}>{statusLabel(fee.status)}</span></div>)}</div></section> : null}
    </div>
  );
}
