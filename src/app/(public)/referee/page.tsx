// ========================================
// File: src/app/(public)/referee/page.tsx
// ========================================

import Link from "next/link";
import { UserRole } from "@prisma/client";
import { requireReferee } from "@/lib/admin";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  type RefereeNightStatus,
  type RefereeNightSummary,
} from "@/lib/referee-nights";

function statusClasses(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "SETTLED":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "REOPENED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "DRAFT":
    default:
      return "border-white/10 bg-white/5 text-white/75";
  }
}

function formatStatus(status: RefereeNightStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function sortNightSoonestFirst(a: RefereeNightSummary, b: RefereeNightSummary) {
  return a.nightDate.localeCompare(b.nightDate);
}

function sortNightNewestFirst(a: RefereeNightSummary, b: RefereeNightSummary) {
  return b.nightDate.localeCompare(a.nightDate);
}

function formatLedgerDate(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatCard({
  label,
  value,
  text,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  text: string;
  tone?: "emerald" | "amber" | "sky" | "neutral";
}) {
  const classes =
    tone === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100/75"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10 text-amber-100/75"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10 text-sky-100/75"
          : "border-white/10 bg-white/[0.04] text-white/45";

  return (
    <div className={`rounded-3xl border p-5 ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-5 text-white/55">{text}</p>
    </div>
  );
}

function CurrentViewBanner({
  isAdminPreview,
  isAdminOverview,
  refereeName,
  refereeId,
}: {
  isAdminPreview: boolean;
  isAdminOverview: boolean;
  refereeName: string;
  refereeId: string;
}) {
  const label = isAdminPreview
    ? "Referee Preview"
    : isAdminOverview
      ? "Full Admin Referee Overview"
      : "Referee View";
  const description = isAdminPreview
    ? `You are seeing exactly what ${refereeName} sees on the referee dashboard.`
    : isAdminOverview
      ? "You are viewing the admin-wide referee dashboard. This is not a single referee's view."
      : "You are using your referee dashboard.";

  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-black/20 p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Current view
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-50">
              {label}
            </span>
            {isAdminPreview ? (
              <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                Admin preview mode
              </span>
            ) : null}
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {isAdminPreview || isAdminOverview ? (
            <Link
              href="/admin"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
            >
              Admin home
            </Link>
          ) : null}

          {isAdminPreview ? (
            <Link
              href={`/admin/referees/${refereeId}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${refereeId}`)}`}
              className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Switch back to Full Admin View
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NightCard({ night, isNext }: { night: RefereeNightSummary; isNext: boolean }) {
  const canOpen = night.status !== "SETTLED" && night.status !== "CANCELLED";

  return (
    <article className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition hover:border-emerald-400/25 hover:bg-white/[0.06]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                {formatStatus(night.status)}
              </span>
              {isNext ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                  Next up
                </span>
              ) : null}
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/65">
                {formatNightDate(night.nightDate)}
              </span>
            </div>

            <h2 className="mt-4 text-xl font-semibold leading-tight text-white">
              {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              {night.venueName || "Venue TBC"} · {night.fixtureCount} fixture{night.fixtureCount === 1 ? "" : "s"}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/referee/night/${night.id}`}
                className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
              >
                {canOpen ? "Open night" : "View night"}
              </Link>
            </div>
          </div>

          <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-[440px] lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">Fee</div>
              <div className="mt-1 font-semibold text-white">{formatMoney(night.feePence)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-white/35">Collected</div>
              <div className="mt-1 font-semibold text-white">{formatMoney(night.cashCollectedPence)}</div>
            </div>
            <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-emerald-100/45">Due SIXFL</div>
              <div className="mt-1 font-semibold text-emerald-100">{formatMoney(night.dueToSixflPence)}</div>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 p-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-amber-100/45">Due to you</div>
              <div className="mt-1 font-semibold text-amber-100">{formatMoney(night.dueToRefereePence)}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function getLedgerBalanceLabel(night: RefereeNightSummary) {
  if (night.dueToRefereePence > 0) {
    return night.status === "SETTLED" ? "Paid to you" : "Owed to you";
  }

  if (night.dueToSixflPence > 0) {
    return night.status === "SETTLED" ? "Settled to SIXFL" : "You owe SIXFL";
  }

  return "Balanced";
}

function getLedgerBalanceAmount(night: RefereeNightSummary) {
  if (night.dueToRefereePence > 0) return night.dueToRefereePence;
  if (night.dueToSixflPence > 0) return night.dueToSixflPence;
  return 0;
}

function getLedgerBalanceClasses(night: RefereeNightSummary) {
  if (night.dueToRefereePence > 0) return "text-amber-100";
  if (night.dueToSixflPence > 0) return "text-emerald-100";
  return "text-white";
}

function getLedgerSettlementLabel(night: RefereeNightSummary) {
  if (night.status === "SETTLED") {
    return night.settledAt ? `Settled ${formatLedgerDate(night.settledAt)}` : "Settled";
  }

  if (night.status === "CANCELLED") return "Cancelled";

  if (night.dueToRefereePence > 0) return "Not paid yet";
  if (night.dueToSixflPence > 0) return "Not settled yet";
  return "No balance due";
}

function RefereeLedger({ nights }: { nights: RefereeNightSummary[] }) {
  const ledgerNights = nights
    .filter((night) => night.status !== "CANCELLED")
    .sort(sortNightNewestFirst);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Referee ledger
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Money owed and paid</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            This shows each referee night, the fee, cash collected, the balance, and when SIXFL marked it as settled.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
          {ledgerNights.length} ledger item{ledgerNights.length === 1 ? "" : "s"}
        </div>
      </div>

      {ledgerNights.length === 0 ? (
        <div className="px-6 py-10 text-sm text-white/55">
          No ledger entries yet. Once a referee night is created, it will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-black/20 text-left text-[11px] uppercase tracking-[0.16em] text-white/40">
              <tr>
                <th className="px-5 py-3 font-semibold">Night</th>
                <th className="px-5 py-3 font-semibold">League</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Fee</th>
                <th className="px-5 py-3 text-right font-semibold">Cash collected</th>
                <th className="px-5 py-3 text-right font-semibold">Balance</th>
                <th className="px-5 py-3 font-semibold">Paid / settled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {ledgerNights.map((night) => (
                <tr key={night.id} className="align-top hover:bg-white/[0.03]">
                  <td className="px-5 py-4 text-white/72">{formatNightDate(night.nightDate)}</td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-white">
                      {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {night.venueName || "Venue TBC"} · {night.fixtureCount} fixture{night.fixtureCount === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                      {formatStatus(night.status)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-white/72">{formatMoney(night.feePence)}</td>
                  <td className="px-5 py-4 text-right text-white/72">{formatMoney(night.cashCollectedPence)}</td>
                  <td className={`px-5 py-4 text-right font-semibold ${getLedgerBalanceClasses(night)}`}>
                    <div>{formatMoney(getLedgerBalanceAmount(night))}</div>
                    <div className="mt-1 text-xs font-normal text-white/45">{getLedgerBalanceLabel(night)}</div>
                  </td>
                  <td className="px-5 py-4 text-white/60">{getLedgerSettlementLabel(night)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function RefereePage() {
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();
  const isAdminOverview = authenticatedUser.role === UserRole.ADMIN && !isAdminPreview;

  const nights = await getRefereeNightSummaries(
    isAdminOverview ? undefined : { refereeId: user.id },
  );

  const activeNights = nights.filter((night) => night.status !== "CANCELLED");
  const openNights = nights.filter(
    (night) => night.status !== "SETTLED" && night.status !== "CANCELLED",
  );
  const submittedNights = nights.filter((night) => night.status === "SUBMITTED");
  const settledNights = nights.filter((night) => night.status === "SETTLED");
  const outstandingDueToSixfl = activeNights
    .filter((night) => night.status !== "SETTLED")
    .reduce((sum, night) => sum + night.dueToSixflPence, 0);
  const outstandingDueToReferee = activeNights
    .filter((night) => night.status !== "SETTLED")
    .reduce((sum, night) => sum + night.dueToRefereePence, 0);
  const paidToReferee = settledNights.reduce((sum, night) => sum + night.dueToRefereePence, 0);
  const totalFixtures = nights.reduce((sum, night) => sum + night.fixtureCount, 0);
  const nextNight = [...openNights].sort(sortNightSoonestFirst)[0] ?? null;
  const refereeName = user.name || user.email || "this referee";

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <CurrentViewBanner
          isAdminPreview={isAdminPreview}
          isAdminOverview={isAdminOverview}
          refereeName={refereeName}
          refereeId={user.id}
        />

        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:py-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Referee dashboard
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {nextNight ? "Next referee night" : "Your referee nights"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
                {nextNight
                  ? `${nextNight.leagueName}${nextNight.leagueSeason ? ` · ${nextNight.leagueSeason}` : ""}`
                  : "Referee work will appear here once SIXFL assigns you to a night."}
              </p>

              {nextNight ? (
                <>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(nextNight.status)}`}>
                      {formatStatus(nextNight.status)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                      {formatNightDate(nextNight.nightDate)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                      {nextNight.venueName || "Venue TBC"}
                    </span>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                      {nextNight.fixtureCount} fixture{nextNight.fixtureCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-white/55">
                    Open the night page to enter scores, record any cash collected and submit your cashup when the night is complete.
                  </p>
                </>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/referee/availability"
                  className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
                >
                  Mark availability
                </Link>
                {nextNight ? (
                  <Link
                    href={`/referee/night/${nextNight.id}`}
                    className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                  >
                    Open next night
                  </Link>
                ) : null}
                <a
                  href="#referee-nights"
                  className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  View all nights
                </a>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <StatCard label="Open nights" value={openNights.length} text="Ready for score entry or cashup." tone="emerald" />
              <StatCard label="Submitted" value={submittedNights.length} text="Waiting for SIXFL review." tone="amber" />
              <StatCard label="Due SIXFL" value={formatMoney(outstandingDueToSixfl)} text="Outstanding cash to pass back." tone="sky" />
              <StatCard label="Due to you" value={formatMoney(outstandingDueToReferee)} text="Outstanding referee balance." tone="neutral" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Link
            href="/referee/availability"
            className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 transition hover:bg-emerald-500/15"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Availability
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">Mark dates</p>
            <p className="mt-2 text-sm leading-5 text-emerald-100/70">
              Tell SIXFL which league nights you can referee next month.
            </p>
          </Link>
          <StatCard label="Fixtures covered" value={totalFixtures} text="Across all assigned referee nights." tone="neutral" />
          <StatCard label="Settled nights" value={settledNights.length} text="Completed and reconciled." tone="emerald" />
          <StatCard label="Paid to date" value={formatMoney(paidToReferee)} text="Referee payments marked settled by SIXFL." tone="sky" />
          <Link
            href={nextNight ? `/referee/night/${nextNight.id}` : "#referee-nights"}
            className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 transition hover:bg-emerald-500/15"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Quick action
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {nextNight ? "Open night page" : "Check assignments"}
            </p>
            <p className="mt-2 text-sm leading-5 text-emerald-100/70">
              {nextNight ? "Enter results, cash and notes for your next night." : "No open night is currently assigned."}
            </p>
          </Link>
        </section>

        <RefereeLedger nights={nights} />

        <section id="referee-nights" className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                Assigned nights
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">Night schedule</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
              {nights.length} total
            </div>
          </div>

          {nights.length === 0 ? (
            <div className="px-6 py-10 text-sm text-white/55">
              No referee nights are assigned yet. Once SIXFL assigns you to a night, it will appear here.
            </div>
          ) : (
            <div className="space-y-4 p-5">
              {nights.map((night) => (
                <NightCard key={night.id} night={night} isNext={nextNight?.id === night.id} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
