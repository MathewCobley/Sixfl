// ========================================
// File: src/app/(admin)/admin/payments/player-credits/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Credits | SIXFL Admin",
};

type CreditBalanceRow = {
  teamId: string;
  teamName: string;
  playerName: string;
  playerContact: string | null;
  teamMemberId: string | null;
  prospectId: string | null;
  balancePence: number;
};

type CreditLedgerRow = CreditBalanceRow & {
  id: string;
  entryType: string;
  amountPence: number;
  description: string | null;
  sourceFeeId: string | null;
  appliedFeeId: string | null;
  createdAt: Date;
};

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function formatEntryType(type: string) {
  if (type === "CREDIT_ADDED") return "Credit added";
  if (type === "CREDIT_USED") return "Credit used";
  if (type === "CREDIT_REFUNDED") return "Credit refunded";
  return type.replaceAll("_", " ");
}

function signedAmount(type: string, amountPence: number) {
  return type === "CREDIT_ADDED" ? amountPence : -amountPence;
}

function SummaryCard({ title, value }: { title: string; value: string | number }) {
  return (
    <AdminCard className="p-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </AdminCard>
  );
}

async function ensurePlayerCreditTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PlayerMatchFeeCreditLedgerEntry" (
      "id" TEXT NOT NULL,
      "teamId" TEXT NOT NULL,
      "teamMemberId" TEXT,
      "prospectId" TEXT,
      "sourceFeeId" TEXT,
      "appliedFeeId" TEXT,
      "entryType" TEXT NOT NULL,
      "amountPence" INTEGER NOT NULL,
      "description" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlayerMatchFeeCreditLedgerEntry_pkey" PRIMARY KEY ("id")
    );
  `);
}

async function getCreditBalances() {
  await ensurePlayerCreditTable();

  return prisma.$queryRaw<CreditBalanceRow[]>(Prisma.sql`
    SELECT
      t."id" AS "teamId",
      t."name" AS "teamName",
      COALESCE(u."name", CONCAT(p."firstName", ' ', p."lastName"), p."email", u."email", 'Unknown player') AS "playerName",
      COALESCE(u."email", p."email", p."phone") AS "playerContact",
      c."teamMemberId",
      c."prospectId",
      COALESCE(SUM(
        CASE
          WHEN c."entryType" = 'CREDIT_ADDED' THEN c."amountPence"
          WHEN c."entryType" IN ('CREDIT_USED', 'CREDIT_REFUNDED') THEN -c."amountPence"
          ELSE 0
        END
      ), 0)::int AS "balancePence"
    FROM "PlayerMatchFeeCreditLedgerEntry" c
    JOIN "Team" t ON t."id" = c."teamId"
    LEFT JOIN "TeamMember" tm ON tm."id" = c."teamMemberId"
    LEFT JOIN "User" u ON u."id" = tm."userId"
    LEFT JOIN "TeamPlayerProspect" p ON p."id" = c."prospectId"
    GROUP BY t."id", t."name", u."name", u."email", p."firstName", p."lastName", p."email", p."phone", c."teamMemberId", c."prospectId"
    HAVING COALESCE(SUM(
      CASE
        WHEN c."entryType" = 'CREDIT_ADDED' THEN c."amountPence"
        WHEN c."entryType" IN ('CREDIT_USED', 'CREDIT_REFUNDED') THEN -c."amountPence"
        ELSE 0
      END
    ), 0) > 0
    ORDER BY "balancePence" DESC, t."name" ASC, "playerName" ASC
  `);
}

async function getRecentLedgerEntries() {
  await ensurePlayerCreditTable();

  return prisma.$queryRaw<CreditLedgerRow[]>(Prisma.sql`
    SELECT
      c."id",
      t."id" AS "teamId",
      t."name" AS "teamName",
      COALESCE(u."name", CONCAT(p."firstName", ' ', p."lastName"), p."email", u."email", 'Unknown player') AS "playerName",
      COALESCE(u."email", p."email", p."phone") AS "playerContact",
      c."teamMemberId",
      c."prospectId",
      c."entryType",
      c."amountPence",
      c."description",
      c."sourceFeeId",
      c."appliedFeeId",
      c."createdAt"
    FROM "PlayerMatchFeeCreditLedgerEntry" c
    JOIN "Team" t ON t."id" = c."teamId"
    LEFT JOIN "TeamMember" tm ON tm."id" = c."teamMemberId"
    LEFT JOIN "User" u ON u."id" = tm."userId"
    LEFT JOIN "TeamPlayerProspect" p ON p."id" = c."prospectId"
    ORDER BY c."createdAt" DESC, c."id" DESC
    LIMIT 100
  `);
}

export default async function PlayerCreditsAdminPage() {
  await requireAdmin();

  const [balances, ledger] = await Promise.all([
    getCreditBalances(),
    getRecentLedgerEntries(),
  ]);

  const totalCreditPence = balances.reduce((sum, row) => sum + row.balancePence, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/payments" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to payments
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Player credits
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Player credit ledger
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          See players who have credit from paid player match fees that were removed, voided or carried forward after fixture changes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Players with credit" value={balances.length} />
        <SummaryCard title="Total player credit" value={formatMoney(totalCreditPence)} />
        <SummaryCard title="Ledger entries" value={ledger.length} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Current credit balances</h2>
        <p className="mt-2 text-sm text-white/55">
          These are usable balances. When the player is selected for a future match, the credit is applied automatically.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.16em] text-white/45">
              <tr>
                <th className="px-3 py-3">Team</th>
                <th className="px-3 py-3">Player</th>
                <th className="px-3 py-3">Contact</th>
                <th className="px-3 py-3 text-right">Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-white/45">
                    No player credits yet.
                  </td>
                </tr>
              ) : null}
              {balances.map((row) => (
                <tr key={`${row.teamId}:${row.teamMemberId ?? row.prospectId}`} className="text-white/75">
                  <td className="px-3 py-3 font-medium text-white">{row.teamName}</td>
                  <td className="px-3 py-3">{row.playerName}</td>
                  <td className="px-3 py-3 text-white/50">{row.playerContact ?? "No contact"}</td>
                  <td className="px-3 py-3 text-right font-semibold text-emerald-200">{formatMoney(row.balancePence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Recent player credit ledger</h2>
        <p className="mt-2 text-sm text-white/55">
          Audit trail of credits added, used or refunded.
        </p>

        <div className="mt-5 space-y-3">
          {ledger.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/55">
              No player credit ledger entries yet.
            </div>
          ) : null}
          {ledger.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{entry.playerName}</span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">
                      {entry.teamName}
                    </span>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">
                      {formatEntryType(entry.entryType)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/45">{entry.playerContact ?? "No contact"}</div>
                  {entry.description ? <div className="mt-2 text-sm text-white/55">{entry.description}</div> : null}
                  <div className="mt-2 text-xs text-white/35">{formatDate(entry.createdAt)}</div>
                </div>
                <div className={`text-right text-lg font-semibold ${signedAmount(entry.entryType, entry.amountPence) >= 0 ? "text-emerald-200" : "text-amber-200"}`}>
                  {signedAmount(entry.entryType, entry.amountPence) >= 0 ? "+" : "-"}{formatMoney(Math.abs(signedAmount(entry.entryType, entry.amountPence)))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
