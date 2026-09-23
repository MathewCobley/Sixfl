import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, UserRole } from "@prisma/client";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import { requireReferee } from "@/lib/admin";
import { toLondonDateInputValue } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import {
  formatMoney,
  formatNightDate,
  getRefereeNightSummaries,
  getRefereePayableDueToRefereePence,
  isRefereeNightPayable,
  type RefereeNightStatus,
  type RefereeNightSummary,
} from "@/lib/referee-nights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OnsiteRefereeRow = {
  nightId: string;
  totalReferees: number | bigint;
  refereeNames: string[] | null;
};

type OnsiteRefereeSummary = {
  nightId: string;
  totalReferees: number;
  coReferees: string[];
};

function normaliseName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function makeTextList(values: string[]) {
  if (values.length === 0) return "You are the only listed referee.";
  if (values.length === 1) return `Refereeing with: ${values[0]}.`;
  return `Refereeing with: ${values.slice(0, -1).join(", ")} and ${values.at(-1)}.`;
}

async function getOnsiteRefereeSummaries(
  refereeId: string,
  currentRefereeName: string,
) {
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
    const names = (row.refereeNames ?? []).map(normaliseName).filter(Boolean);
    return {
      nightId: row.nightId,
      totalReferees: Number(row.totalReferees ?? names.length),
      coReferees: names.filter((name) => name !== currentRefereeName),
    } satisfies OnsiteRefereeSummary;
  });
}

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
    default:
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
}

function statusLabel(status: RefereeNightStatus) {
  if (status === "DRAFT") return "Scheduled";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function isClosedNight(night: RefereeNightSummary) {
  return ["SUBMITTED", "APPROVED", "SETTLED", "CANCELLED"].includes(night.status);
}

function legacyCutoff(today: string) {
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 14);
  return cutoff.toISOString().slice(0, 10);
}

function isHistoricOpenNight(night: RefereeNightSummary, cutoff: string) {
  return (
    (night.status === "DRAFT" || night.status === "REOPENED") &&
    night.nightDate < cutoff
  );
}

function actionLabel(night: RefereeNightSummary, today: string) {
  if (isClosedNight(night)) return "View match night";
  if (night.nightDate < today) return "Complete match night";
  if (night.nightDate === today) return "Run match night";
  return "View match night";
}

function NightCard({
  night,
  today,
  isNext = false,
  needsAction = false,
  onsite,
}: {
  night: RefereeNightSummary;
  today: string;
  isNext?: boolean;
  needsAction?: boolean;
  onsite?: OnsiteRefereeSummary;
}) {
  const dueNow = getRefereePayableDueToRefereePence(night, today);
  const payable = isRefereeNightPayable(night, today);

  return (
    <article
      className={[
        "rounded-[1.25rem] border p-3.5",
        needsAction
          ? "border-amber-400/25 bg-amber-500/[0.06]"
          : isNext
            ? "border-emerald-400/25 bg-emerald-500/[0.055]"
            : "border-white/10 bg-white/[0.025]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${statusClasses(night.status)}`}>
            {statusLabel(night.status)}
          </span>
          {isNext ? (
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">
              Next
            </span>
          ) : null}
          {needsAction ? (
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">
              Needs action
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] font-medium text-white/45">
          {formatNightDate(night.nightDate)}
        </span>
      </div>

      <h2 className="mt-3 text-base font-black leading-tight text-white">
        {night.leagueName}
        {night.leagueSeason ? ` · ${night.leagueSeason}` : ""}
      </h2>
      <p className="mt-1 text-xs leading-5 text-white/45">
        {night.venueName || "Venue TBC"} · {night.fixtureCount} fixture{night.fixtureCount === 1 ? "" : "s"}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5">
          <div className="text-[10px] text-white/35">{payable ? "Night fee" : "Earns after night"}</div>
          <div className="mt-0.5 text-sm font-black text-white">{formatMoney(night.feePence)}</div>
        </div>
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2.5">
          <div className="text-[10px] text-emerald-100/50">Due now</div>
          <div className="mt-0.5 text-sm font-black text-emerald-100">{formatMoney(dueNow)}</div>
        </div>
      </div>

      {onsite ? (
        <div className="mt-3 rounded-xl border border-sky-400/15 bg-sky-500/[0.07] px-3 py-2.5">
          <div className="text-xs font-bold text-white">
            {onsite.totalReferees} referee{onsite.totalReferees === 1 ? "" : "s"} on site
          </div>
          <div className="mt-0.5 text-xs leading-5 text-white/45">{makeTextList(onsite.coReferees)}</div>
        </div>
      ) : null}

      <Link
        href={`/referee/night/${night.id}`}
        className={[
          "mt-3 flex min-h-12 w-full items-center justify-between rounded-xl px-4 text-sm font-black",
          needsAction
            ? "bg-amber-300 text-[#1c1200] active:bg-amber-200"
            : "bg-emerald-400 text-[#04130c] active:bg-emerald-300",
        ].join(" ")}
      >
        <span>{actionLabel(night, today)}</span>
        <span aria-hidden="true" className="text-lg">→</span>
      </Link>
    </article>
  );
}

export default async function RefereeNightsPage() {
  const { user, authenticatedUser, isAdminPreview } = await requireReferee();

  if (authenticatedUser.role === UserRole.ADMIN && !isAdminPreview) {
    redirect("/admin/referees?error=select_referee_preview");
  }

  const today = toLondonDateInputValue(new Date());
  const currentName = normaliseName(user.name) || normaliseName(user.email) || "You";
  const [nights, onsiteRows] = await Promise.all([
    getRefereeNightSummaries({ refereeId: user.id }),
    getOnsiteRefereeSummaries(user.id, currentName),
  ]);
  const onsiteByNightId = new Map(onsiteRows.map((item) => [item.nightId, item]));
  const cutoff = legacyCutoff(today);

  const historic = nights
    .filter((night) => isHistoricOpenNight(night, cutoff))
    .sort((a, b) => b.nightDate.localeCompare(a.nightDate));

  const active = nights.filter(
    (night) => !isClosedNight(night) && !isHistoricOpenNight(night, cutoff),
  );
  const needsAction = active
    .filter((night) => night.nightDate < today)
    .sort((a, b) => b.nightDate.localeCompare(a.nightDate));
  const upcoming = active
    .filter((night) => night.nightDate >= today)
    .sort((a, b) => a.nightDate.localeCompare(b.nightDate));
  const previous = nights
    .filter(isClosedNight)
    .sort((a, b) => b.nightDate.localeCompare(a.nightDate));

  return (
    <RefereeAppShell active="nights" title="Nights">
      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <h1 className="text-lg font-black text-white">Your referee nights</h1>
        <p className="mt-1 text-xs leading-5 text-white/45">
          Upcoming work, anything that still needs completing, and your previous nights.
        </p>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-xl border border-white/[0.08] bg-black/20 px-2 py-2.5">
            <div className="text-base font-black tabular-nums text-white">{upcoming.length}</div>
            <div className="mt-0.5 text-[9px] text-white/40">Upcoming</div>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-500/[0.07] px-2 py-2.5">
            <div className="text-base font-black tabular-nums text-amber-100">{needsAction.length}</div>
            <div className="mt-0.5 text-[9px] text-amber-100/50">Need action</div>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/20 px-2 py-2.5">
            <div className="text-base font-black tabular-nums text-white">{previous.length}</div>
            <div className="mt-0.5 text-[9px] text-white/40">Previous</div>
          </div>
        </div>
      </section>

      {needsAction.length > 0 ? (
        <section>
          <div className="mb-2 px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200/75">
              Needs action
            </p>
            <h2 className="mt-0.5 text-base font-black text-white">Finish these nights</h2>
          </div>
          <div className="space-y-2.5">
            {needsAction.map((night) => (
              <NightCard
                key={night.id}
                night={night}
                today={today}
                needsAction
                onsite={onsiteByNightId.get(night.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300/75">
              Upcoming
            </p>
            <h2 className="mt-0.5 text-base font-black text-white">What&apos;s next</h2>
          </div>
          {upcoming.length > 0 ? (
            <span className="text-[10px] text-white/35">{upcoming.length} booked</span>
          ) : null}
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-white/50">
            No upcoming referee nights are assigned yet. Keep your availability up to date and new nights will appear here.
          </div>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((night, index) => (
              <NightCard
                key={night.id}
                night={night}
                today={today}
                isNext={index === 0}
                onsite={onsiteByNightId.get(night.id)}
              />
            ))}
          </div>
        )}
      </section>

      {previous.length > 0 ? (
        <details className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.025]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-black text-white/65 [&::-webkit-details-marker]:hidden">
            <span>Previous nights</span>
            <span className="text-xs font-semibold text-white/35">{previous.length}</span>
          </summary>
          <div className="space-y-2.5 border-t border-white/[0.07] p-2.5">
            {previous.map((night) => (
              <NightCard
                key={night.id}
                night={night}
                today={today}
                onsite={onsiteByNightId.get(night.id)}
              />
            ))}
          </div>
        </details>
      ) : null}

      {historic.length > 0 ? (
        <details className="rounded-xl border border-white/10 bg-black/15 px-3.5 py-3 text-xs text-white/45">
          <summary className="cursor-pointer font-semibold text-white/55">
            {historic.length} historic unfinished record{historic.length === 1 ? "" : "s"}
          </summary>
          <p className="mt-2 leading-5">
            These older records remain in SIXFL history but are kept out of your normal match-night list.
          </p>
        </details>
      ) : null}
    </RefereeAppShell>
  );
}
