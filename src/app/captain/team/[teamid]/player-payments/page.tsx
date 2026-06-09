// ========================================
// File: src/app/captain/team/[teamid]/player-payments/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import type { PlayerMatchFeeStatus } from "@prisma/client";

import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
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
      return "Enter a valid amount per player.";
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

function getPlayerContact(input: {
  memberEmail?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
}) {
  return [input.memberEmail, input.prospectEmail, input.prospectPhone]
    .filter(Boolean)
    .join(" · ") || "No contact saved";
}

export default async function CaptainPlayerPaymentsPage({
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
      orderBy: [{ kickoffAt: "asc" }],
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

  const now = new Date();
  const selectedFixture =
    fixtures.find((fixture) => fixture.id === sp.fixtureId) ??
    fixtures.find((fixture) => fixture.kickoffAt >= now) ??
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

  const openFeeIdsWithoutLinks = fees
    .filter((fee) => fee.status === "OPEN" && (!fee.paymentToken || !fee.paymentUrl))
    .map((fee) => fee.id);

  if (openFeeIdsWithoutLinks.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(openFeeIdsWithoutLinks);
  }

  const activeFees = fees.filter((fee) => fee.status !== "CANCELLED");
  const selectedMemberIds = new Set(
    activeFees.filter((fee) => fee.teamMemberId).map((fee) => fee.teamMemberId as string),
  );
  const selectedProspectIds = new Set(
    activeFees.filter((fee) => fee.prospectId).map((fee) => fee.prospectId as string),
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
  const defaultAmount = activeFees.find((fee) => fee.status !== "PAID")?.amountPence ?? 400;
  const savedMessage = getSavedMessage(sp.saved);
  const errorMessage = getErrorMessage(sp.error);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Squad payments
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Collect money from your players
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-white/65 sm:text-base">
            Set the amount each player owes, choose the players for the fixture, then share secure Stripe payment links and track who has paid. The team still remains responsible for the SIXFL fixture fee.
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

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Players", value: activeFees.length, text: "Included in this collection.", classes: "border-white/10 bg-white/[0.04] text-white/45" },
          { label: "Collected", value: formatMoney(totals.paid), text: `${paidCount} paid`, classes: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/70" },
          { label: "Outstanding", value: formatMoney(totals.open), text: `${openCount} unpaid`, classes: "border-amber-400/20 bg-amber-500/10 text-amber-100/70" },
          { label: "Collection total", value: formatMoney(totals.total), text: "This is captain collection tracking, not the fixed SIXFL team invoice.", classes: "border-sky-400/20 bg-sky-500/10 text-sky-100/70" },
        ].map((item) => (
          <div key={item.label} className={`rounded-3xl border p-5 ${item.classes}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{item.label}</p>
            <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
            <p className="mt-2 text-sm text-white/55">{item.text}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Choose fixture</h2>
          <p className="mt-1 text-sm text-white/55">Pick the fixture or week you want to collect player payments for.</p>
          <div className="mt-5 space-y-2">
            {fixtures.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">No fixtures are available for this team yet.</div> : null}
            {fixtures.map((fixture) => {
              const isSelected = selectedFixture?.id === fixture.id;
              const isPast = fixture.kickoffAt < now;

              return (
                <Link
                  key={fixture.id}
                  href={`/captain/team/${team.id}/player-payments?fixtureId=${fixture.id}`}
                  className={`block rounded-2xl border p-4 transition ${isSelected ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70 hover:bg-white/[0.06]"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold">{getFixtureLabel({ homeTeamName: fixture.homeTeam.name, awayTeamName: fixture.awayTeam.name })}</div>
                    {isPast ? <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">Past fixture</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {formatUkDateTime(fixture.kickoffAt)}{fixture.venue?.name ? ` · ${fixture.venue.name}` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Create / update collection</h2>
          <p className="mt-1 text-sm text-white/55">
            Choose the players and enter the amount each one should pay. Paid rows are kept safe and will not be reset.
          </p>

          {selectedFixture ? (
            <form action={createCaptainSquadPaymentCollectionAction} className="mt-5 space-y-5">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="fixtureId" value={selectedFixture.id} />

              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4">
                <label htmlFor="amount" className="text-sm font-medium text-emerald-50">Amount per player</label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    defaultValue={(defaultAmount / 100).toFixed(2)}
                    className="w-full max-w-[180px] rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                  />
                  <p className="text-sm text-emerald-100/70">Example: 4.00, 5.00 or 6.00. Stripe will take each player to a secure checkout page.</p>
                </div>
              </div>

              <div className={`grid gap-4 ${selectableProspects.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <h3 className="font-semibold text-white">Linked squad members</h3>
                  <div className="mt-3 space-y-2">
                    {members.length === 0 ? <div className="text-sm text-white/45">No linked members yet.</div> : null}
                    {members.map((member) => (
                      <label key={member.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                        <input type="checkbox" name="player" value={`member:${member.id}`} defaultChecked={selectedMemberIds.has(member.id)} className="mt-1" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-white">{member.user.name || member.user.email || "Unnamed member"}</span>
                          <span className="mt-1 block text-xs text-white/45">{member.user.email || "No email saved"}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {selectableProspects.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="font-semibold text-white">Extra / unlinked players</h3>
                    <p className="mt-1 text-xs text-white/45">Use this for someone who played but is not yet linked to the squad.</p>
                    <div className="mt-3 space-y-2">
                      {selectableProspects.map((prospect) => {
                        const fullName = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ").trim();

                        return (
                          <label key={prospect.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/75">
                            <input type="checkbox" name="player" value={`prospect:${prospect.id}`} defaultChecked={selectedProspectIds.has(prospect.id)} className="mt-1" />
                            <span>
                              <span className="block font-medium text-white">{fullName || prospect.email || prospect.phone || "Unnamed player"}</span>
                              <span className="block text-xs text-white/45">
                                {[prospect.email, prospect.phone].filter(Boolean).join(" · ") || "No contact saved"}
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
                Create / refresh payment links
              </button>
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
            const shareHref = fee.paymentUrl
              ? `https://wa.me/?text=${encodeURIComponent(shareText)}`
              : null;

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
                  {fee.status === "OPEN" && fee.paymentUrl ? (
                    <div className="mt-3 break-all rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-white/60">
                      {fee.paymentUrl}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {fee.status === "OPEN" && fee.paymentUrl ? (
                    <>
                      <Link href={fee.paymentUrl} target="_blank" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15">
                        Open link
                      </Link>
                      {shareHref ? (
                        <Link href={shareHref} target="_blank" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10">
                          Share on WhatsApp
                        </Link>
                      ) : null}
                    </>
                  ) : fee.status === "PAID" ? (
                    <span className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100">Paid</span>
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
