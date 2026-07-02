// ========================================
// File: src/app/(admin)/admin/payments/team-pot/page.tsx
// ========================================

import Link from "next/link";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Pots | SIXFL",
};

type TeamPotSummaryRow = {
  teamId: string;
  teamName: string;
  leagueName: string | null;
  leagueSeason: string | null;
  balancePence: number | bigint | null;
  entryCount: number | bigint;
  lastEntryAt: Date | null;
};

type TeamPotEntryRow = {
  id: string;
  teamName: string;
  amountPence: number | bigint;
  sourceType: string;
  description: string;
  kickoffAt: Date | null;
  createdAt: Date;
};

function toNumber(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return value ?? 0;
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amountPence / 100);
}

function formatDate(value: Date | null) {
  if (!value) return "No fixture date";
  return formatDateTimeInLondon(value, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getLeagueLabel(row: TeamPotSummaryRow) {
  return [row.leagueName, row.leagueSeason].filter(Boolean).join(" · ") || "No league linked";
}

export default async function AdminTeamPotPage() {
  await requireAdmin();

  const [teamRows, recentEntries] = await Promise.all([
    prisma.$queryRaw<TeamPotSummaryRow[]>`
      SELECT t."id" AS "teamId", t."name" AS "teamName", l."name" AS "leagueName", l."season" AS "leagueSeason", COALESCE(SUM(e."amountPence"), 0) AS "balancePence", COUNT(e."id") AS "entryCount", MAX(e."createdAt") AS "lastEntryAt"
      FROM "Team" t
      LEFT JOIN "League" l ON l."id" = t."leagueId"
      LEFT JOIN "TeamCreditPotEntry" e ON e."teamId" = t."id"
      GROUP BY t."id", t."name", l."name", l."season"
      HAVING COALESCE(SUM(e."amountPence"), 0) <> 0
      ORDER BY COALESCE(SUM(e."amountPence"), 0) DESC, t."name" ASC
    `,
    prisma.$queryRaw<TeamPotEntryRow[]>`
      SELECT e."id", t."name" AS "teamName", e."amountPence", e."sourceType", e."description", f."kickoffAt", e."createdAt"
      FROM "TeamCreditPotEntry" e
      INNER JOIN "Team" t ON t."id" = e."teamId"
      LEFT JOIN "Fixture" f ON f."id" = e."fixtureId"
      ORDER BY e."createdAt" DESC
      LIMIT 50
    `,
  ]);

  const totalPotPence = teamRows.reduce((sum, row) => sum + toNumber(row.balancePence), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Team pots</p>
          <h1 className="text-3xl font-semibold text-white">Overpayment credit pots</h1>
          <p className="max-w-3xl text-sm text-white/60">Squad payment overpayments are kept as team credit entries. This keeps the original player payments intact while making surplus money visible for future admin decisions.</p>
        </div>
        <Link href="/admin/payments" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10">Back to payments</Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Total in pots</div><div className="mt-3 text-3xl font-semibold text-white">{formatMoney(totalPotPence)}</div><p className="mt-2 text-sm text-emerald-100/70">Current credit balance across teams.</p></div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Teams with credit</div><div className="mt-3 text-3xl font-semibold text-white">{teamRows.length}</div><p className="mt-2 text-sm text-white/50">Only non-zero balances are shown.</p></div>
        <div className="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5"><div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/70">Recent entries</div><div className="mt-3 text-3xl font-semibold text-white">{recentEntries.length}</div><p className="mt-2 text-sm text-sky-100/70">Latest pot movements shown below.</p></div>
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold text-white">Team balances</h2>
        <div className="mt-4 space-y-3">
          {teamRows.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">No team pot balances yet.</div> : null}
          {teamRows.map((row) => {
            const balancePence = toNumber(row.balancePence);
            const entryCount = toNumber(row.entryCount);
            return <div key={row.teamId} className="rounded-2xl border border-white/10 bg-[#0d1428] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-base font-semibold text-white">{row.teamName}</div><div className="mt-1 text-sm text-white/50">{getLeagueLabel(row)}</div><div className="mt-2 text-xs text-white/35">{entryCount} pot entr{entryCount === 1 ? "y" : "ies"} · latest {formatDate(row.lastEntryAt)}</div></div><div className="text-left sm:text-right"><div className="text-2xl font-semibold text-emerald-100">{formatMoney(balancePence)}</div><div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/40">Credit balance</div></div></div></div>;
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold text-white">Recent pot entries</h2>
        <div className="mt-4 space-y-3">
          {recentEntries.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">No pot entries have been recorded yet.</div> : null}
          {recentEntries.map((entry) => <div key={entry.id} className="rounded-2xl border border-white/10 bg-[#0d1428] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-semibold text-white">{entry.teamName}</div><div className="mt-1 text-sm text-white/55">{entry.description}</div><div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]"><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/45">{entry.sourceType.replaceAll("_", " ")}</span><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/45">{formatDate(entry.kickoffAt)}</span></div></div><div className="text-left sm:text-right"><div className="text-xl font-semibold text-emerald-100">{formatMoney(toNumber(entry.amountPence))}</div><div className="mt-1 text-xs text-white/40">Added {formatDate(entry.createdAt)}</div></div></div></div>)}
        </div>
      </section>
    </div>
  );
}
