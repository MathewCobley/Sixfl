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
import {
  createCaptainSquadPaymentCollectionAction,
  resendCaptainPlayerPaymentLinkAction,
} from "./actions";

type Props = {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<{
    fixtureId?: string;
    saved?: string;
    error?: string;
    emailsQueued?: string;
    emailsSkipped?: string;
  }>;
};

type Tone = "white" | "emerald" | "amber" | "red";

const ZERO_FEE_WAIVER_NOTE = "Zero-fee player share waived by SIXFL";

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
  if (tone === "emerald") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70";
  }
  if (tone === "amber") {
    return "border-amber-400/25 bg-amber-500/10 text-amber-100/70";
  }
  if (tone === "red") {
    return "border-red-400/20 bg-red-500/10 text-red-100/70";
  }
  return "border-white/10 bg-white/[0.04] text-white/45";
}

function statusClasses(status: string) {
  if (status === "PAID" || status === "SETTLED") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "WAIVED") {
    return "border-sky-400/25 bg-sky-500/10 text-sky-100";
  }
  if (status === "CANCELLED") {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }
  return "border-amber-400/25 bg-amber-500/10 text-amber-100";
}

function isCaptainCollected(note?: string | null) {
  return Boolean(note?.includes("captain/organiser marked"));
}

function isZeroFeeCaptainSettled(status?: string | null, note?: string | null) {
  return status === "WAIVED" && Boolean(note?.includes(ZERO_FEE_WAIVER_NOTE));
}

function statusLabel(status: string, note?: string | null) {
  if (isZeroFeeCaptainSettled(status, note)) return "Settled";
  if (isCaptainCollected(note)) return "Captain collected";
  if (status === "PAID") return "Paid";
  if (status === "WAIVED") return "No payment needed";
  if (status === "CANCELLED") return "Cancelled";
  return "Awaiting payment";
}

function fixtureTitle(fixture: {
  homeTeam: { name: string };
  awayTeam: { name: string };
}) {
  return `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`;
}

function playerName(fee: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}) {
  if (fee.teamMember) {
    return fee.teamMember.user.name || fee.teamMember.user.email || "Unnamed member";
  }
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

function playerContact(input: {
  memberEmail?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
}) {
  return (
    [input.memberEmail, input.prospectEmail, input.prospectPhone]
      .filter(Boolean)
      .join(" · ") || "No contact saved"
  );
}

function collectionMethod(
  status?: string | null,
  amountPence?: number | null,
  note?: string | null,
) {
  if (status === "PAID" || isCaptainCollected(note)) return "captain_paid";
  if (status === "WAIVED" || amountPence === 0) return "waived";
  return "link";
}

function messageForSaved(saved?: string, emailsQueuedRaw?: string) {
  if (saved === "payment_link_resent") {
    return "Payment link email queued again for this player.";
  }

  if (saved !== "collection_created") return null;

  const emailsQueued = Number(emailsQueuedRaw ?? "0");
  if (Number.isFinite(emailsQueued) && emailsQueued > 0) {
    return `Player collection saved. ${emailsQueued} payment link email${emailsQueued === 1 ? "" : "s"} queued.`;
  }

  return "Player collection saved. No new payment-link email was queued. If a player is awaiting payment and says the link has not arrived, use Send payment link again below.";
}

function messageForError(error?: string) {
  if (error === "missing_fixture") return "Choose a fixture first.";
  if (error === "invalid_amount") return "Enter a valid default amount per player.";
  if (error === "invalid_player_amount") return "One player amount is invalid.";
  if (error === "no_players") return "Select at least one player.";
  if (error === "missing_player_email") {
    return "Payment links can only be emailed to players with a saved email address. Add the missing email first.";
  }
  if (error === "payment_request_not_found") {
    return "That open player payment request could not be found for this fixture.";
  }
  if (error === "payment_link_not_sent") {
    return "The payment request is still open, but the email could not be queued. Check the player's email address and try Send payment link again.";
  }
  if (error === "fixture_not_found") {
    return "That fixture could not be found for this team.";
  }
  return null;
}

export default async function PaymentPageServer({ params, searchParams }: Props) {
  const { teamid } = await params;
  await requireCaptain(teamid);
  const sp = (await searchParams) ?? {};

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: { id: true, name: true },
  });
  if (!team) notFound();

  const ledger = await getTeamPaymentLedger(teamid);
  const relatedTeamIds = ledger?.relatedTeamIds ?? [teamid];
  const selectedLedgerEntry =
    (sp.fixtureId
      ? ledger?.entries.find((entry) => entry.fixtureId === sp.fixtureId)
      : null) ??
    ledger?.selectedEntry ??
    null;

  const [fixtures, members, prospects] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        status: { in: ["SCHEDULED", "COMPLETED"] },
        AND: [
          {
            OR: [
              { homeTeamId: { in: relatedTeamIds } },
              { awayTeamId: { in: relatedTeamIds } },
            ],
          },
          {
            OR: [
              { publishedAt: { not: null } },
              {
                playerMatchFees: {
                  some: {
                    teamId: { in: relatedTeamIds },
                    status: { not: "CANCELLED" },
                  },
                },
              },
              {
                paymentCharges: {
                  some: {
                    teamId: { in: relatedTeamIds },
                    status: { not: "VOID" },
                  },
                },
              },
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
      },
    }),
  ]);

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const selectedFixture =
    (sp.fixtureId ? fixtureById.get(sp.fixtureId) ?? null : null) ??
    (selectedLedgerEntry?.fixtureId
      ? fixtureById.get(selectedLedgerEntry.fixtureId) ?? null
      : null) ??
    fixtures[0] ??
    null;
  const selectedEntry =
    (selectedFixture
      ? ledger?.entries.find((entry) => entry.fixtureId === selectedFixture.id) ?? null
      : null) ??
    selectedLedgerEntry;
  const selectedFixtureEditable = Boolean(
    selectedFixture &&
      (selectedFixture.homeTeamId === teamid || selectedFixture.awayTeamId === teamid),
  );

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const fees = fixtureIds.length
    ? await prisma.playerMatchFee.findMany({
        where: {
          teamId: { in: relatedTeamIds },
          fixtureId: { in: fixtureIds },
          status: { not: "CANCELLED" },
        },
        orderBy: [{ createdAt: "asc" }],
        include: {
          teamMember: {
            include: { user: { select: { name: true, email: true } } },
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

  const zeroFeeSettledPenceByFixture = new Map<string, number>();
  for (const fee of fees) {
    if (!isZeroFeeCaptainSettled(fee.status, fee.note)) continue;
    zeroFeeSettledPenceByFixture.set(
      fee.fixtureId,
      (zeroFeeSettledPenceByFixture.get(fee.fixtureId) ?? 0) + fee.amountPence,
    );
  }

  const selectedFees = selectedFixture
    ? fees.filter((fee) => fee.fixtureId === selectedFixture.id)
    : [];
  const missingLinkIds = selectedFees
    .filter(
      (fee) => fee.status === "OPEN" && (!fee.paymentToken || !fee.paymentUrl),
    )
    .map((fee) => fee.id);
  if (missingLinkIds.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(missingLinkIds);
  }

  const currentTeamFees = selectedFees.filter((fee) => fee.teamId === teamid);
  const selectedMemberIds = new Set(
    currentTeamFees
      .filter((fee) => fee.teamMemberId)
      .map((fee) => fee.teamMemberId as string),
  );
  const selectedProspectIds = new Set(
    currentTeamFees
      .filter((fee) => fee.prospectId)
      .map((fee) => fee.prospectId as string),
  );
  const feeByMemberId = new Map(
    currentTeamFees
      .filter((fee) => fee.teamMemberId)
      .map((fee) => [fee.teamMemberId as string, fee]),
  );
  const feeByProspectId = new Map(
    currentTeamFees
      .filter((fee) => fee.prospectId)
      .map((fee) => [fee.prospectId as string, fee]),
  );
  const linkedMemberKeys = new Set(
    members.flatMap(
      (member) =>
        [member.user.email?.toLowerCase(), member.user.name?.toLowerCase()].filter(
          Boolean,
        ) as string[],
    ),
  );
  const selectableProspects = prospects.filter((prospect) => {
    const fullName = [prospect.firstName, prospect.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()
      .toLowerCase();
    const email = prospect.email?.trim().toLowerCase();
    return !(
      (email && linkedMemberKeys.has(email)) ||
      (fullName && linkedMemberKeys.has(fullName))
    );
  });
  const playersForForm = [
    ...members.map((member) => ({
      kind: "member" as const,
      id: member.id,
      value: `member:${member.id}`,
      label: member.user.name || member.user.email || "Unnamed member",
      contact: member.user.email,
      emailRequired: !member.user.email?.trim(),
      checked: selectedMemberIds.has(member.id),
      fee: feeByMemberId.get(member.id),
    })),
    ...selectableProspects.map((prospect) => ({
      kind: "prospect" as const,
      id: prospect.id,
      value: `prospect:${prospect.id}`,
      label:
        [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") ||
        prospect.email ||
        prospect.phone ||
        "Unnamed prospect",
      contact: playerContact({
        prospectEmail: prospect.email,
        prospectPhone: prospect.phone,
      }),
      emailRequired: !prospect.email?.trim(),
      checked: selectedProspectIds.has(prospect.id),
      fee: feeByProspectId.get(prospect.id),
    })),
  ];

  const defaultAmount =
    currentTeamFees.find((fee) => fee.status !== "PAID")?.amountPence ?? 400;
  const selectedSettledPlayerCount = selectedFees.filter(
    (fee) => fee.status === "PAID" || isZeroFeeCaptainSettled(fee.status, fee.note),
  ).length;
  const selectedOpenPlayerCount = selectedFees.filter(
    (fee) => fee.status === "OPEN",
  ).length;
  const selectedWaivedCount = selectedFees.filter(
    (fee) =>
      fee.status === "WAIVED" &&
      !isCaptainCollected(fee.note) &&
      !isZeroFeeCaptainSettled(fee.status, fee.note),
  ).length;
  const playerAllocationPence = selectedFees.reduce(
    (sum, fee) => sum + fee.amountPence,
    0,
  );
  const zeroFeeSettledPence = selectedFees.reduce(
    (sum, fee) =>
      sum + (isZeroFeeCaptainSettled(fee.status, fee.note) ? fee.amountPence : 0),
    0,
  );
  const hasPlayerCollection = selectedFees.length > 0;
  const selectedTeamFeePence =
    selectedEntry?.amountPence ?? selectedFixture?.matchFeePence ?? 4000;
  const directPaidPence = selectedEntry?.directPaidPence ?? 0;
  const collectedPence = selectedEntry?.playerPaidPence ?? 0;
  const captainSettledPence = collectedPence + zeroFeeSettledPence;
  const playerOutstandingPence = selectedEntry?.playerOpenPence ?? 0;
  const stillToCoverPence = selectedEntry?.outstandingPence ?? 0;
  const savedMessage = messageForSaved(sp.saved, sp.emailsQueued);
  const errorMessage = messageForError(sp.error);

  const summaryTone: Tone = !selectedEntry
    ? "white"
    : stillToCoverPence <= 0
      ? "emerald"
      : hasPlayerCollection
        ? "amber"
        : "white";

  let summaryTitle = "Choose a fixture to view its payment status.";
  let summaryText =
    "Once a fixture is selected, this page will show what has been assigned, what has been paid and what the team still owes.";
  let summaryNextStep: string | null = null;

  if (selectedEntry && stillToCoverPence <= 0) {
    summaryTitle = "This fixture fee is fully covered.";
    summaryText = `${formatMoney(selectedEntry.amountPence)} has been covered: ${formatMoney(directPaidPence)} paid directly by the team and ${formatMoney(captainSettledPence)} of player shares settled.`;
  } else if (selectedEntry && !hasPlayerCollection) {
    summaryTitle = "No player collection has been set up yet.";
    summaryText = `The fixture fee is ${formatMoney(selectedEntry.amountPence)}. No amounts have been assigned to players and no player payment requests have been created. The team balance is currently ${formatMoney(stillToCoverPence)}.`;
    summaryNextStep =
      "Next step: choose the players below, set how much each should pay, then save the collection.";
  } else if (selectedEntry && hasPlayerCollection) {
    summaryTitle =
      playerOutstandingPence > 0
        ? "Player collection is active."
        : "Player collection has been created.";
    summaryText = `${formatMoney(playerAllocationPence)} has been assigned across ${selectedFees.length} player${selectedFees.length === 1 ? "" : "s"}. ${formatMoney(captainSettledPence)} of player shares are settled and ${formatMoney(playerOutstandingPence)} is still awaiting payment from players. The team balance remaining is ${formatMoney(stillToCoverPence)}.`;
    summaryNextStep =
      playerOutstandingPence > 0
        ? "Payment links remain open for the players shown as awaiting payment below. If someone has not received theirs, use Send payment link again."
        : stillToCoverPence > 0
          ? "There are no open player requests, but part of the team fee is still not covered. Update the player collection or arrange the remaining team payment."
          : null;
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-6 lg:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Squad payments
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Collect money from your players
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
          Choose a fixture, decide which players should contribute and create their payment
          requests. Money received from players automatically reduces the team balance for
          that fixture.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/captain/team/${team.id}`}
            className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80"
          >
            Back to captain hub
          </Link>
          <Link
            href={`/captain/team/${team.id}/squad`}
            className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50"
          >
            Open squad
          </Link>
        </div>
      </section>

      {savedMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {savedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className={`rounded-3xl border p-6 ${toneClasses(summaryTone)}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">
          What is happening with this fixture?
        </p>
        <h3 className="mt-3 text-xl font-semibold text-white">{summaryTitle}</h3>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/70">{summaryText}</p>
        {summaryNextStep ? (
          <p className="mt-3 text-sm font-semibold text-white/85">{summaryNextStep}</p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Fixture fee",
            value: formatMoney(selectedTeamFeePence),
            text: "Total SIXFL fee for this fixture.",
            tone: "white" as Tone,
          },
          {
            label: "Assigned to players",
            value: formatMoney(playerAllocationPence),
            text: hasPlayerCollection
              ? `${selectedFees.length} player amount${selectedFees.length === 1 ? "" : "s"} created.`
              : "No player collection set up.",
            tone: "white" as Tone,
          },
          {
            label: "Player shares settled",
            value: formatMoney(captainSettledPence),
            text: `${selectedSettledPlayerCount} player share${selectedSettledPlayerCount === 1 ? "" : "s"} settled.`,
            tone: captainSettledPence > 0 ? ("emerald" as Tone) : ("white" as Tone),
          },
          {
            label: "Awaiting from players",
            value: formatMoney(playerOutstandingPence),
            text: hasPlayerCollection
              ? `${selectedOpenPlayerCount} open payment request${selectedOpenPlayerCount === 1 ? "" : "s"}.`
              : "No payment requests created.",
            tone: playerOutstandingPence > 0 ? ("amber" as Tone) : ("white" as Tone),
          },
          {
            label: "Team balance remaining",
            value: formatMoney(stillToCoverPence),
            text: selectedEntry
              ? stillToCoverPence > 0
                ? "Amount still owed to SIXFL."
                : "Fixture fee fully covered."
              : "No team charge found.",
            tone:
              stillToCoverPence > 0
                ? ("red" as Tone)
                : selectedEntry
                  ? ("emerald" as Tone)
                  : ("white" as Tone),
          },
        ].map((item) => (
          <div key={item.label} className={`rounded-3xl border p-5 ${toneClasses(item.tone)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              {item.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
            <p className="mt-2 text-sm text-white/55">{item.text}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">
            Select a fixture to see its team fee and player collection status.
          </p>
          <div className="mt-5 space-y-2">
            {(ledger?.entries ?? []).length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                No fixture payment charges are available for this team yet.
              </div>
            ) : null}
            {(ledger?.entries ?? []).map((entry) => {
              const href = entry.fixtureId
                ? `/captain/team/${team.id}/player-payments?fixtureId=${entry.fixtureId}`
                : `/captain/team/${team.id}/player-payments`;
              const selected = selectedEntry?.chargeId === entry.chargeId;
              const meta = [entry.leagueSeason, entry.divisionName, entry.venueName]
                .filter(Boolean)
                .join(" · ");
              const zeroFeeSettledPence = entry.fixtureId
                ? zeroFeeSettledPenceByFixture.get(entry.fixtureId) ?? 0
                : 0;
              const captainPlayerSettledPence = entry.playerPaidPence + zeroFeeSettledPence;
              const hasCollection = captainPlayerSettledPence > 0 || entry.playerOpenPence > 0;
              const badgeLabel =
                entry.outstandingPence <= 0
                  ? "Fee covered"
                  : hasCollection
                    ? "Collection active"
                    : "Collection not set up";
              const badgeStatus =
                entry.outstandingPence <= 0 ? "PAID" : hasCollection ? "OPEN" : "WAIVED";

              return (
                <Link
                  key={entry.chargeId}
                  href={href}
                  className={`block rounded-2xl border p-4 transition ${
                    selected
                      ? "border-emerald-400/30 bg-emerald-500/10 text-white"
                      : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{entry.fixtureLabel}</div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClasses(badgeStatus)}`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {formatDateTime(entry.kickoffAt ?? entry.dueDate)}
                    {meta ? ` · ${meta}` : ""}
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-white/55">
                    <div>Fixture fee: {formatMoney(entry.amountPence)}</div>
                    {entry.directPaidPence > 0 ? (
                      <div>Paid directly by team: {formatMoney(entry.directPaidPence)}</div>
                    ) : null}
                    {hasCollection ? (
                      <>
                        <div>Player shares settled: {formatMoney(captainPlayerSettledPence)}</div>
                        <div>
                          Awaiting from players: {formatMoney(entry.playerOpenPence)}
                        </div>
                      </>
                    ) : (
                      <div>Player collection: not set up</div>
                    )}
                    <div>Team balance remaining: {formatMoney(entry.outstandingPence)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">
            Set up / update player collection
          </h2>
          <p className="mt-1 text-sm text-white/55">
            Select the players who should contribute, set their amount and choose how each
            payment will be handled. Saving this form creates or updates the player payment
            rows; it does not mark the team fee as paid.
          </p>
          {selectedFixture && selectedFixtureEditable ? (
            <form
              action={createCaptainSquadPaymentCollectionAction}
              className="mt-5 space-y-5"
            >
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="fixtureId" value={selectedFixture.id} />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-sm font-semibold text-white">
                  {fixtureTitle(selectedFixture)}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  {formatDateTime(selectedFixture.kickoffAt)}
                  {selectedFixture.venue?.name
                    ? ` · ${selectedFixture.venue.name}`
                    : ""}
                </div>
              </div>
              <div>
                <label className="text-sm text-white/60" htmlFor="amount">
                  Default amount per player
                </label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/45">
                    £
                  </span>
                  <input
                    id="amount"
                    type="number"
                    name="amount"
                    min="0.01"
                    step="0.01"
                    defaultValue={(defaultAmount / 100).toFixed(2)}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 pl-8 text-white outline-none focus:border-emerald-400/40"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-semibold text-white">Players</div>
                {playersForForm.map((player) => {
                  const amountName = `amount_${player.kind}_${player.id}`;
                  const collectionName = `collection_${player.kind}_${player.id}`;
                  const method = collectionMethod(
                    player.fee?.status,
                    player.fee?.amountPence,
                    player.fee?.note,
                  );

                  return (
                    <div
                      key={`${player.kind}-${player.id}`}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="player"
                          disabled={player.emailRequired && !player.fee}
                          value={player.value}
                          defaultChecked={player.checked}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-white">
                            {player.label}
                          </span>
                          <span className="mt-1 block text-xs text-white/45">
                            {player.emailRequired
                              ? "Email required — add an email before sending a payment link"
                              : player.contact || "No contact saved"}
                          </span>
                        </span>
                      </label>
                      <div className="mt-3 grid gap-3 md:grid-cols-[150px_1fr]">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/45">
                            £
                          </span>
                          <input
                            type="number"
                            name={amountName}
                            min="0"
                            step="0.01"
                            defaultValue={
                              player.fee
                                ? (player.fee.amountPence / 100).toFixed(2)
                                : ""
                            }
                            placeholder="Default"
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pl-7 text-sm text-white outline-none focus:border-emerald-400/40"
                          />
                        </div>
                        <div className="grid gap-2 text-xs text-white/70 md:grid-cols-3">
                          {[
                            ["link", "Send SIXFL payment link"],
                            ["captain_paid", "Captain already collected"],
                            ["waived", "Waived / no charge"],
                          ].map(([value, label]) => (
                            <label
                              key={value}
                              className="flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-2"
                            >
                              <input
                                type="radio"
                                name={collectionName}
                                value={value}
                                defaultChecked={method === value}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
              >
                Save player collection
              </button>
            </form>
          ) : selectedEntry ? (
            <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100/80">
              This is a historical or migrated fixture charge for {selectedEntry.fixtureLabel}.
              It cannot be edited from this player collection page. The remaining team balance
              is {formatMoney(selectedEntry.outstandingPence)}.
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
              Choose a published current-team fixture first.
            </div>
          )}
        </div>
      </section>

      {selectedFees.length > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Player payment status</h2>
          <p className="mt-1 text-sm text-white/55">
            This shows what has happened for each player in the selected fixture. Open requests can be sent again if a player has not received the email.
          </p>
          <div className="mt-4 divide-y divide-white/10">
            {selectedFees.map((fee) => {
              const captainStatus = isZeroFeeCaptainSettled(fee.status, fee.note)
                ? "SETTLED"
                : fee.status;
              const canResend = fee.status === "OPEN" && fee.teamId === teamid;

              return (
                <div
                  key={fee.id}
                  className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">{playerName(fee)}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {formatMoney(fee.amountPence)} ·{" "}
                      {fee.teamId === teamid ? "Current team" : "Historical team row"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(captainStatus)}`}
                    >
                      {statusLabel(fee.status, fee.note)}
                    </span>
                    {canResend ? (
                      <form action={resendCaptainPlayerPaymentLinkAction}>
                        <input type="hidden" name="teamId" value={teamid} />
                        <input type="hidden" name="fixtureId" value={fee.fixtureId} />
                        <input type="hidden" name="feeId" value={fee.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
                        >
                          Send payment link again
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {selectedWaivedCount > 0 ? (
        <p className="text-xs text-white/35">
          {selectedWaivedCount} player row{selectedWaivedCount === 1 ? " is" : "s are"}
          marked as no payment needed.
        </p>
      ) : null}
    </div>
  );
}
