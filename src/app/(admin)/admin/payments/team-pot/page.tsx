// ========================================
// File: src/app/(admin)/admin/payments/team-pot/page.tsx
// ========================================

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Team Pots | SIXFL" };

type PotRow = {
  teamId: string;
  teamName: string;
  balancePence: number | bigint | null;
  entryCount: number | bigint;
};

function toNumber(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  return value ?? 0;
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amountPence / 100);
}

export default async function AdminTeamPotPage() {
  await requireAdmin();

  const rows = await prisma.$queryRaw<PotRow[]>`
    SELECT t."id" AS "teamId", t."name" AS "teamName", COALESCE(SUM(e."amountPence"), 0) AS "balancePence", COUNT(e."id") AS "entryCount"
    FROM "Team" t
    LEFT JOIN "TeamCreditPotEntry" e ON e."teamId" = t."id"
    GROUP BY t."id", t."name"
    HAVING COALESCE(SUM(e."amountPence"), 0) <> 0
    ORDER BY COALESCE(SUM(e."amountPence"), 0) DESC, t."name" ASC
  `;

  const totalPence = rows.reduce((sum, row) => sum + toNumber(row.balancePence), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Team pots</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Overpayment credit pots</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/60">Squad payment overpayments are stored as team credit entries so surplus money remains visible.</p>
        </div>
        <Link href="/admin/payments" className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10">Back to payments</Link>
      </div>

      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Total in team pots</div>
        <div className="mt-3 text-4xl font-semibold text-white">{formatMoney(totalPence)}</div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-xl font-semibold text-white">Team balances</h2>
        <div className="mt-4 space-y-3">
          {rows.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">No team pot balances yet.</div> : null}
          {rows.map((row) => (
            <div key={row.teamId} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#0d1428] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white">{row.teamName}</div>
                <div className="mt-1 text-sm text-white/45">{toNumber(row.entryCount)} pot entr{toNumber(row.entryCount) === 1 ? "y" : "ies"}</div>
              </div>
              <div className="text-2xl font-semibold text-emerald-100">{formatMoney(toNumber(row.balancePence))}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
