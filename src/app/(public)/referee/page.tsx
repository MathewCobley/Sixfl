// ========================================
// File: src/app/(public)/referee/page.tsx
// ========================================

import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, UserRole } from "@prisma/client";

import RefereeTabs from "@/components/referee/RefereeTabs";
import { requireReferee } from "@/lib/admin";
import {
  formatDateTimeInLondon,
  toLondonDateInputValue,
} from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  type RefereeNightStatus,
  type RefereeNightSummary,
} from "@/lib/referee-nights";

type OnsiteRefereeSummary = {
  nightId: string;
  totalReferees: number;
  refereeNames: string[];
  coReferees: string[];
};

type OnsiteRefereeRow = {
  nightId: string;
  totalReferees: number | bigint;
  refereeNames: string[] | null;
};

function statusClasses(status: RefereeNightStatus) {
  switch (status) {
    case "SUBMITTED":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "APPROVED":
      return "border-sky-400/20 bg-sky-400/10 text-sky-200";
    case "SETTLED":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
    case "REOPENED":
      return "border-violet-400/20 bg-violet-400/10 text-violet-200";
    case "CANCELLED":
      return "border-red-400/20 bg-red-500/10 text-red-200";
    case "DRAFT":
    default:
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
}

function formatStatus(status: RefereeNightStatus) {
  if (status === "DRAFT") return "Scheduled";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function sortNightSoonestFirst(a: RefereeNightSummary, b: RefereeNightSummary) {
  return a.nightDate.localeCompare(b.nightDate);
}

function sortNightNewestFirst(a: RefereeNightSummary, b: RefereeNightSummary) {
  return b.nightDate.localeCompare(a.nightDate);
}

function isNightPayable(night: RefereeNightSummary, todayLondonDate: string) {
  if (night.status === "CANCELLED") return false;
  if (["SUBMITTED", "APPROVED", "SETTLED", "REOPENED"].includes(night.status)) {
    return true;
  }

  return night.nightDate < todayLondonDate;
}

function getPayableDueToRefereePence(
  night: RefereeNightSummary,
  todayLondonDate: string,
) {
  return isNightPayable(night, todayLondonDate) ? night.dueToRefereePence : 0;
}

function getPayableDueToSixflPence(
  night: RefereeNightSummary,
  todayLondonDate: string,
) {
  return isNightPayable(night, todayLondonDate) ? night.dueToSixflPence : 0;
}

function formatLedgerDate(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normaliseName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function makeTextList(values: string[]) {
  if (values.length === 0) return "You are the only listed referee for this night.";
  if (values.length === 1) return `Refereeing with: ${values[0]}.`;

  const last = values[values.length - 1];
  const rest = values.slice(0, -1).join(", ");
  return `Refereeing with: ${rest} and ${last}.`;
}

async function getOnsiteRefereeSummaries(
  refereeId: string,
  currentRefereeName: string,
): Promise<OnsiteRefereeSummary[]> {
  const rows = await prisma.$queryRaw<OnsiteRefereeRow[]>(Prisma.sql`
    WITH my_nights AS (
      SELECT id, "leagueId", "venueId", "nightDate"
      FROM "RefereeNight"
      WHERE "refereeId" = ${refereeId}
        AND status <> 'CANCELLED'
    )
    SELECT
      mn.id AS "nightId",
      COUNT(DISTINCT rn."refereeId")::int AS "totalReferees",
      ARRAY_AGG(
        DISTINCT COALESCE(NULLIF(u.name, ''), u.email)
        ORDER BY COALESCE(NULLIF(u.name, ''), u.email)
      ) AS "refereeNames"
    FROM my_nights mn
    JOIN "RefereeNight" rn
      ON rn."leagueId" = mn."leagueId"
      AND rn."nightDate" = mn."nightDate"
      AND rn."venueId" IS NOT DISTINCT FROM mn."venueId"
      AND rn.status <> 'CANCELLED'
    JOIN "User" u ON u.id = rn."refereeId"
    GROUP BY mn.id
  `);

  return rows.map((row) => {
    const refereeNames = (row.refereeNames ?? [])
      .map(normaliseName)
      .filter(Boolean);

    return {
      nightId: row.nightId,
      totalReferees: Number(row.totalReferees ?? refereeNames.length),
      refereeNames,
      coReferees: refereeNames.filter((name) => name !== currentRefereeName),
    };
  });
}

function getLegacyCutoffDate(todayLondonDate: string) {
  const cutoff = new Date(`${todayLondonDate}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);
  return cutoff.toISOString().slice(0, 10);
}

function isLegacyOpenNight(night: RefereeNightSummary, legacyCutoffDate: string) {
  return (
    (night.status === "DRAFT" || night.status === "REOPENED") &&
    night.nightDate < legacyCutoffDate
  );
}

function isClosedNight(night: RefereeNightSummary) {
  return ["SUBMITTED", "APPROVED", "SETTLED", "CANCELLED"].includes(night.status);
}

function CurrentViewBanner({
  isAdminPreview,
  refereeName,
  refereeId,
}: {
  isAdminPreview: boolean;
  refereeName: string;
  refereeId: string;
}) {
  if (!isAdminPreview) return null;

  return (
    <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-100/70">
            Current view
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-50">
              Referee Preview
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/70">
              Admin preview mode
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50/75">
            You are seeing exactly what {refereeName} sees on the referee dashboard.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-black/30"
          >
            Admin home
          </Link>

          <a
            href={`/admin/referees/${refereeId}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${refereeId}`)}`}
            className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20"
          >
            Switch back to Full Admin View
          </a>
        </div>
      </div>
    </section>
  );
}

function RefereeIdentityBanner({
  refereeName,
  refereeEmail,
  isAdminPreview,
}: {
  refereeName: string;
  refereeEmail: string | null;
  isAdminPreview: boolean;
}) {
  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Referee Portal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {refereeName}
          </h1>
          <p className="mt-2 text-sm leading-6 text-emerald-50/75">
            Your referee nights, availability, match sheets, cashup and payments are all shown here.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
          <div className="font-semibold text-white">{isAdminPreview ? "Previewing" : "Logged in as"}</div>
          <div className="mt-1">{refereeEmail || refereeName}</div>
        </div>
      </div>
    </section>
  );
}

function SummaryTile({
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
      ? "border-emerald-400/20 bg-emerald-500/10"
      : tone === "amber"
        ? "border-amber-400/20 bg-amber-500/10"
        : tone === "sky"
          ? "border-sky-400/20 bg-sky-500/10"
          : "border-white/10 bg-white/[0.04]";

  return (
    <div className={`rounded-3xl border p-5 ${classes}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm leading-5 text-white/55">{text}</p>
    </div>
  );
}

function ActionCard({
  href,
  label,
  title,
  text,
  primary = false,
}: {
  href: string;
  label: string;
  title: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-3xl border p-5 transition",
        primary
          ? "border-emerald-400/25 bg-emerald-500/12 hover:bg-emerald-500/18"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
      ].join(" ")}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-5 text-white/60">{text}</p>
    </Link>
  );
}

function NightCard({
  night,
  isNext,
  todayLondonDate,
  onsite,
}: {
  night: RefereeNightSummary;
  isNext: boolean;
  todayLondonDate: string;
  onsite?: OnsiteRefereeSummary;
}) {
  const canOpen = night.status !== "SETTLED" && night.status !== "CANCELLED";
  const isPayable = isNightPayable(night, todayLondonDate);

  return (
    <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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

          <h3 className="mt-3 text-lg font-semibold leading-tight text-white">
            {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
          </h3>
          <p className="mt-1 text-sm text-white/55">
            Referee: {night.refereeName || night.refereeEmail || "Unknown referee"}
          </p>
          <p className="mt-1 text-sm text-white/55">
            {night.venueName || "Venue TBC"} · {night.fixtureCount} fixture{night.fixtureCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
            <span className="text-white/35">Fee </span>
            <span className="font-semibold text-white">{formatMoney(night.feePence)}</span>
          </div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-sm">
            <span className="text-amber-100/45">{isPayable ? "Due " : "After night "}</span>
            <span className="font-semibold text-amber-100">
              {formatMoney(getPayableDueToRefereePence(night, todayLondonDate))}
            </span>
          </div>
          <Link
            href={`/referee/night/${night.id}`}
            className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20"
          >
            {canOpen ? "Open night sheet" : "View night"}
          </Link>
        </div>
      </div>

      {onsite ? (
        <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50/80">
          <div className="font-semibold text-white">
            {onsite.totalReferees} referee{onsite.totalReferees === 1 ? "" : "s"} on site this night
          </div>
          <div className="mt-1 text-sky-50/70">{makeTextList(onsite.coReferees)}</div>
          <div className="mt-2 text-xs text-sky-50/45">
            Listed referees: {onsite.refereeNames.join(", ") || "Not set"}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function getLedgerBalanceLabel(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return "Not due yet";

  if (night.dueToRefereePence > 0) {
    return night.status === "SETTLED" ? "Paid to you" : "Owed to you";
  }

  if (night.dueToSixflPence > 0) {
    return night.status === "SETTLED" ? "Settled to SIXFL" : "You owe SIXFL";
  }

  return "Balanced";
}

function getLedgerBalanceAmount(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return 0;
  if (night.dueToRefereePence > 0) return night.dueToRefereePence;
  if (night.dueToSixflPence > 0) return night.dueToSixflPence;
  return 0;
}

function getLedgerSettlementLabel(night: RefereeNightSummary, todayLondonDate: string) {
  if (!isNightPayable(night, todayLondonDate)) return "Due after the night";

  if (night.status === "SETTLED") {
    return night.settledAt ? `Settled ${formatLedgerDate(night.settledAt)}` : "Settled";
  }

  if (night.status === "CANCELLED") return "Cancelled";

  if (night.dueToRefereePence > 0) return "Not paid yet";
  if (night.dueToSixflPence > 0) return "Not settled yet";
  return "No balance due";
}

function RefereeLedger({
  nights,
  todayLondonDate,
}: {
  nights: RefereeNightSummary[];
  todayLondonDate: string;
}) {
  const ledgerNights = nights
    .filter((night) => night.status !== "CANCELLED")
    .filter((night) => isNightPayable(night, todayLondonDate))
    .sort(sortNightNewestFirst);

  return (
    <details className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-6 py-5 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Referee ledger
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Money owed and paid</h2>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
          {ledgerNights.length} item{ledgerNights.length === 1 ? "" : "s"} · open details
        </div>
      </summary>

      {ledgerNights.length === 0 ? (
        <div className="border-t border-white/10 px-6 py-8 text-sm text-white/55">
          No ledger entries are due yet.
        </div>
      ) : (
        <div className="divide-y divide-white/10 border-t border-white/10">
          {ledgerNights.map((night) => (
            <div key={night.id} className="grid gap-4 px-6 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(night.status)}`}>
                    {formatStatus(night.status)}
                  </span>
                  <span className="text-sm text-white/55">{formatNightDate(night.nightDate)}</span>
                </div>
                <div className="mt-2 font-semibold text-white">
                  {night.leagueName}{night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Referee: {night.refereeName || night.refereeEmail || "Unknown referee"}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Fee {formatMoney(night.feePence)} · Cash collected {formatMoney(night.cashCollectedPence)} · {getLedgerSettlementLabel(night, todayLondonDate)}
                </div>
              </div>
              <div className="flex items-center gap-3 md:justify-end">
                <div className="text-left md:text-right">
                  <div className="text-lg font-semibold text-white">{formatMoney(getLedgerBalanceAmount(night, todayLondonDate))}</div>
                  <div className="text-xs text-white/45">{getLedgerBalanceLabel(night, todayLondonDate)}</div>
                </div>
                {night.status === "REOPENED" ? (
                  <Link
                    href={`/referee/night/${night.id}`}
                    className="inline-flex items-center rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20"
                  >
                    Open reopened night
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function NightSheets({
  openNights,
  closedNights,
  legacyNights,
  nextNight,
  todayLondonDate,
  onsiteByNightId,
}: {
  openNights: RefereeNightSummary[];
  closedNights: RefereeNightSummary[];
  legacyNights: RefereeNightSummary[];
  nextNight: RefereeNightSummary | null;
  todayLondonDate: string;
  onsiteByNightId: Map<string, OnsiteRefereeSummary>;
}) {
  return (
    <section id="referee-night-picker" className="rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            Night sheets
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Choose the night you want to work on</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Only current referee nights that need action are shown here. Historic imported fixture records stay in the league records and do not need a referee night sheet.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
          {openNights.length} open
        </div>
      </div>

      <div className={`mt-5 grid gap-3 ${openNights.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {openNights.length > 0 ? (
          openNights.map((night) => (
            <NightCard
              key={night.id}
              night={night}
              isNext={nextNight?.id === night.id}
              todayLondonDate={todayLondonDate}
              onsite={onsiteByNightId.get(night.id)}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/55">
            No current open referee night sheets.
          </div>
        )}
      </div>

      {legacyNights.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50/75">
          {legacyNights.length} historic imported fixture record{legacyNights.length === 1 ? "" : "s"} hidden from referee work. Results and payments remain on the league/admin records; no referee night action is needed.
        </div>
      ) : null}

      {closedNights.length > 0 ? (
        <details className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white/75 [&::-webkit-details-marker]:hidden">
            Submitted / closed nights ({closedNights.length})
          </summary>
          <div className="grid gap-3 border-t border-white/10 p-4 lg:grid-cols-2">
            {closedNights.slice(0, 5).map((night) => (
              <NightCard
                key={night.id}
                night={night}
                isNext={false}
                todayLondonDate={todayLondonDate}
                onsite={onsiteByNightId.get(night.id)}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default async function RefereePage() {
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();
  const isAdminWithoutPreview = authenticatedUser.role === UserRole.ADMIN && !isAdminPreview;

  if (isAdminWithoutPreview) {
    redirect("/admin/referees?error=select_referee_preview");
  }

  const todayLondonDate = toLondonDateInputValue(new Date());
  const refereeName = user.name || user.email || "this referee";
  const currentRefereeName = normaliseName(user.name) || normaliseName(user.email) || "You";
  const [nights, onsiteSummaries] = await Promise.all([
    getRefereeNightSummaries({ refereeId: user.id }),
    getOnsiteRefereeSummaries(user.id, currentRefereeName),
  ]);
  const onsiteByNightId = new Map(onsiteSummaries.map((summary) => [summary.nightId, summary]));

  const legacyCutoffDate = getLegacyCutoffDate(todayLondonDate);
  const legacyNights = nights.filter((night) => isLegacyOpenNight(night, legacyCutoffDate));
  const currentOpenNights = nights
    .filter((night) => !isLegacyOpenNight(night, legacyCutoffDate))
    .filter((night) => !isClosedNight(night))
    .sort(sortNightSoonestFirst);
  const closedNights = nights
    .filter(isClosedNight)
    .sort(sortNightNewestFirst);
  const activeNights = nights.filter((night) => night.status !== "CANCELLED");
  const submittedNights = nights.filter((night) => night.status === "SUBMITTED");
  const settledNights = nights.filter((night) => night.status === "SETTLED");
  const payableActiveNights = activeNights.filter((night) =>
    isNightPayable(night, todayLondonDate),
  );
  const outstandingDueToSixfl = payableActiveNights.reduce(
    (sum, night) => sum + night.dueToSixflPence,
    0,
  );
  const outstandingDueToReferee = payableActiveNights.reduce(
    (sum, night) => sum + night.dueToRefereePence,
    0,
  );
  const totalFixtures = nights.reduce((sum, night) => sum + night.fixtureCount, 0);
  const nextNight = currentOpenNights[0] ?? null;
  const previewRefereeId = authenticatedUser.role === UserRole.ADMIN ? user.id : null;

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <CurrentViewBanner
          isAdminPreview={isAdminPreview}
          refereeName={refereeName}
          refereeId={user.id}
        />

        <RefereeIdentityBanner
          refereeName={refereeName}
          refereeEmail={user.email}
          isAdminPreview={isAdminPreview}
        />

        <RefereeTabs active="overview" previewRefereeId={previewRefereeId} />

        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Referee dashboard
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {nextNight ? "Next referee night" : "No open night yet"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
                {nextNight
                  ? `${nextNight.leagueName}${nextNight.leagueSeason ? ` · ${nextNight.leagueSeason}` : ""}`
                  : "When SIXFL assigns you to a night, it will appear here."}
              </p>

              {nextNight ? (
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
              ) : null}

              <p className="mt-4 text-sm leading-6 text-white/55">
                Use this dashboard to mark availability, check the match rules, open your night sheet and submit cashup.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryTile label="Open nights" value={currentOpenNights.length} text="Need action or cashup." tone="emerald" />
              <SummaryTile label="Due to you" value={formatMoney(outstandingDueToReferee)} text="Due after completed or submitted nights." tone="amber" />
              <SummaryTile label="Submitted" value={submittedNights.length} text="Waiting for SIXFL review." tone="neutral" />
              <SummaryTile label="Due SIXFL" value={formatMoney(outstandingDueToSixfl)} text="Cash due after completed nights." tone="sky" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <ActionCard
            href="/referee/availability"
            label="Availability"
            title="Mark your dates"
            text="Tell SIXFL which league nights you can referee next month."
            primary
          />
          <ActionCard
            href="/referee/match-rules"
            label="Match rules"
            title="Check the rules"
            text="Quick reference for how SIXFL matches should be managed."
          />
          <ActionCard
            href={nextNight ? `/referee/night/${nextNight.id}` : "#referee-night-picker"}
            label="Next action"
            title={nextNight ? "Open night sheet" : "View night sheets"}
            text={nextNight ? "Enter results, cash and notes for your next night." : "No open night is currently assigned."}
          />
        </section>

        <NightSheets
          openNights={currentOpenNights}
          closedNights={closedNights}
          legacyNights={legacyNights}
          nextNight={nextNight}
          todayLondonDate={todayLondonDate}
          onsiteByNightId={onsiteByNightId}
        />

        <section className="grid gap-4 md:grid-cols-3">
          <SummaryTile label="Fixtures covered" value={totalFixtures} text="Across all assigned referee nights." />
          <SummaryTile label="Settled nights" value={settledNights.length} text="Completed and reconciled." tone="emerald" />
          <SummaryTile label="Total nights" value={nights.length} text="All active and historic assignments." />
        </section>

        <RefereeLedger nights={nights} todayLondonDate={todayLondonDate} />
      </div>
    </main>
  );
}
