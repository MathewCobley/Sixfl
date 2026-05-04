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
  title: "Squad Match Fees | SIXFL",
};

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

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "fees_created":
      return "Player match fees created.";
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

export default async function CaptainManagedPlayerMatchFeesPage({
  params,
  searchParams,
}: Props) {
  const { teamid } = await params;
  await requireCaptain(teamid);

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
        status: { in: ["ACTIVE_SQUAD", "QUALIFIED", "CONTACTED", "NEW"] },
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

  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ??
    fixtures.find((fixture) => fixture.kickoffAt >= new Date()) ??
    fixtures[0] ??
    null;

  const fees = selectedFixture
    ? await prisma.playerMatchFee.findMany({
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
      })
    : [];

  const feeByMemberId = new Map(
    fees.filter((fee) => Boolean(fee.teamMemberId)).map((fee) => [fee.teamMemberId as string, fee]),
  );
  const feeByProspectId = new Map(
    fees.filter((fee) => Boolean(fee.prospectId)).map((fee) => [fee.prospectId as string, fee]),
  );
  const totals = fees.reduce(
    (acc, fee) => {
      acc.total += fee.amountPence;
      if (fee.status === "PAID") acc.paid += fee.amountPence;
      if (fee.status === "OPEN") acc.open += fee.amountPence;
      if (fee.status === "WAIVED") acc.waived += fee.amountPence;
      return acc;
    },
    { total: 0, paid: 0, open: 0, waived: 0 },
  );
  const cashTotal = fees.reduce(
    (sum, fee) => sum + (fee.status === "PAID" && fee.note?.includes("Paid cash") ? fee.amountPence : 0),
    0,
  );
  const onlineTotal = fees.reduce(
    (sum, fee) => sum + (fee.status === "PAID" && fee.note?.includes("Paid online") ? fee.amountPence : 0),
    0,
  );
  const paidCount = fees.filter((fee) => fee.status === "PAID").length;
  const openCount = fees.filter((fee) => fee.status === "OPEN").length;
  const savedMessage = getSavedMessage(sp.saved);
  const errorMessage = getErrorMessage(sp.error);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Managed squad payments
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Player match fees
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
            Build the matchday list, charge each selected player, then track who has paid cash or online. This is for organiser-led managed squads.
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
          This team is currently set as a standard team. Player match fees are intended for managed SIXFL squads.
        </div>
      ) : null}
      {savedMessage ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">{savedMessage}</div> : null}
      {errorMessage ? <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{errorMessage}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Fees", value: fees.length, text: "Created for this fixture.", classes: "border-white/10 bg-white/[0.04] text-white/45" },
          { label: "Paid", value: paidCount, text: formatMoney(totals.paid), classes: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70" },
          { label: "Outstanding", value: openCount, text: formatMoney(totals.open), classes: "border-amber-400/20 bg-amber-500/10 text-amber-100/70" },
          { label: "Waived", value: formatMoney(totals.waived), text: "Manual override.", classes: "border-sky-400/20 bg-sky-500/10 text-sky-100/70" },
        ].map((item) => (
          <div key={item.label} className={`rounded-3xl border p-5 ${item.classes}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
            <p className="mt-2 text-sm text-white/55">{item.text}</p>
          </div>
        ))}
      </section>

      {fees.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2">
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

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">Pick the fixture you are collecting player fees for.</p>
          <div className="mt-5 space-y-2">
            {fixtures.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No fixtures exist for this team yet.</div> : null}
            {fixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              return (
                <Link
                  key={fixture.id}
                  href={`/captain/team/${team.id}/match-fees?fixtureId=${fixture.id}`}
                  className={`block rounded-2xl border p-4 transition ${isSelected ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"}`}
                >
                  <div className="text-sm font-semibold">{getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}</div>
                  <div className="mt-1 text-xs text-white/50">
                    {formatUkDateTime(fixture.kickoffAt)}{fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Create player fees</h2>
          <p className="mt-1 text-sm text-white/55">Select who is playing, enter the match fee, then create or refresh the fee rows.</p>
          {selectedFixture ? (
            <form action={createCaptainPlayerMatchFeesAction} className="mt-5 space-y-5">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="fixtureId" value={selectedFixture.id} />
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="space-y-2">
                  <label htmlFor="amount" className="text-sm text-white/60">Fee per player</label>
                  <input id="amount" name="amount" type="text" inputMode="decimal" defaultValue="6.00" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="note" className="text-sm text-white/60">Note</label>
                  <input id="note" name="note" type="text" placeholder="Optional internal note" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60" />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <h3 className="font-semibold text-white">Linked squad members</h3>
                  <div className="mt-3 space-y-2">
                    {members.length === 0 ? <div className="text-sm text-white/45">No linked members yet.</div> : null}
                    {members.map((member) => {
                      const existingFee = feeByMemberId.get(member.id);
                      return (
                        <label key={member.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                          <input type="checkbox" name="player" value={`member:${member.id}`} defaultChecked={Boolean(existingFee)} className="mt-1" />
                          <span>
                            <span className="block font-medium text-white">{member.user.name || member.user.email || "Unnamed member"}</span>
                            <span className="block text-xs text-white/45">{member.user.email || "No email"}{existingFee ? ` · ${getFeeStatusLabel(existingFee.status)}` : ""}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <h3 className="font-semibold text-white">Pending / prospect players</h3>
                  <div className="mt-3 space-y-2">
                    {prospects.length === 0 ? <div className="text-sm text-white/45">No prospects in this team yet.</div> : null}
                    {prospects.map((prospect) => {
                      const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();
                      const existingFee = feeByProspectId.get(prospect.id);
                      return (
                        <label key={prospect.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                          <input type="checkbox" name="player" value={`prospect:${prospect.id}`} defaultChecked={Boolean(existingFee)} className="mt-1" />
                          <span>
                            <span className="block font-medium text-white">{fullName || prospect.email || prospect.phone || "Unnamed prospect"}</span>
                            <span className="block text-xs text-white/45">{prospect.email || "No email"}{prospect.phone ? ` · ${prospect.phone}` : ""}{existingFee ? ` · ${getFeeStatusLabel(existingFee.status)}` : ""}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button type="submit" className="inline-flex items-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400">
                Create / update player fees
              </button>
            </form>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">Create or select a fixture before adding player fees.</div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Fee tracker</h2>
            <p className="mt-1 text-sm text-white/55">Manual tracking for the selected fixture. Use Paid cash or Paid online so the night can be reconciled properly.</p>
          </div>
          {selectedFixture ? <div className="text-sm text-white/55">{getFixtureLabel({ homeTeamName: selectedFixture.homeTeam.name, awayTeamName: selectedFixture.awayTeam.name })}</div> : null}
        </div>

        <div className="mt-5 space-y-3">
          {fees.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">No player fees have been created for this fixture yet.</div> : null}
          {fees.map((fee) => {
            const playerName = fee.teamMember
              ? fee.teamMember.user.name || fee.teamMember.user.email || "Unnamed member"
              : fee.prospect
                ? [fee.prospect.firstName, fee.prospect.lastName].filter(Boolean).join(" ") || fee.prospect.email || fee.prospect.phone || "Unnamed prospect"
                : "Unknown player";
            const playerContact = fee.teamMember
              ? fee.teamMember.user.email || "No email"
              : fee.prospect
                ? [fee.prospect.email, fee.prospect.phone].filter(Boolean).join(" · ") || "No contact"
                : "No contact";
            const statusButtons = ["OPEN", "WAIVED", "CANCELLED"] as PlayerMatchFeeStatus[];

            return (
              <div key={fee.id} className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
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
    </div>
  );
}
