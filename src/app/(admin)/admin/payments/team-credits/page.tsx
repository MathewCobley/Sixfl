// ========================================
// File: src/app/(admin)/admin/payments/team-credits/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { addTeamCredit } from "@/lib/payments/team-credits";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Credits | SIXFL Admin",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RecentCreditRow = {
  id: string;
  teamId: string;
  teamName: string;
  entryType: string;
  amountPence: number;
  description: string | null;
  chargeTitle: string | null;
  createdAt: Date;
};

type CreditBalanceRow = {
  teamId: string;
  teamName: string;
  balancePence: number;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

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
  if (type === "CREDIT_REVERSED") return "Credit reversed";
  return type.replaceAll("_", " ");
}

function signedAmount(type: string, amountPence: number) {
  return type === "CREDIT_ADDED" ? amountPence : -amountPence;
}

async function addTeamCreditAction(formData: FormData) {
  "use server";

  const { user } = await requireAdmin();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const amountPounds = Number(formData.get("amountPounds") ?? "0");
  const description = String(formData.get("description") ?? "").trim();

  if (!teamId || !Number.isFinite(amountPounds) || amountPounds <= 0) {
    redirect("/admin/payments/team-credits?error=invalid");
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });

  if (!team) redirect("/admin/payments/team-credits?error=missing_team");

  await addTeamCredit({
    teamId,
    amountPence: Math.round(amountPounds * 100),
    description: description || "Team credit added by SIXFL admin.",
    createdByUserId: user.id,
  });

  revalidatePath("/admin/payments/team-credits");
  revalidatePath("/admin/payments");
  revalidatePath(`/captain/team/${teamId}/payments`);

  redirect("/admin/payments/team-credits?saved=credit_added");
}

async function getRecentCredits() {
  return prisma.$queryRaw<RecentCreditRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."teamId",
      t."name" AS "teamName",
      c."entryType"::text AS "entryType",
      c."amountPence",
      c."description",
      pc."title" AS "chargeTitle",
      c."createdAt"
    FROM "TeamCreditLedgerEntry" c
    JOIN "Team" t ON t."id" = c."teamId"
    LEFT JOIN "PaymentCharge" pc ON pc."id" = c."chargeId"
    ORDER BY c."createdAt" DESC, c."id" DESC
    LIMIT 80
  `);
}

async function getCreditBalances() {
  return prisma.$queryRaw<CreditBalanceRow[]>(Prisma.sql`
    SELECT
      t."id" AS "teamId",
      t."name" AS "teamName",
      COALESCE(SUM(
        CASE
          WHEN c."entryType" = 'CREDIT_ADDED' THEN c."amountPence"
          ELSE -c."amountPence"
        END
      ), 0)::int AS "balancePence"
    FROM "TeamCreditLedgerEntry" c
    JOIN "Team" t ON t."id" = c."teamId"
    GROUP BY t."id", t."name"
    HAVING COALESCE(SUM(
      CASE
        WHEN c."entryType" = 'CREDIT_ADDED' THEN c."amountPence"
        ELSE -c."amountPence"
      END
    ), 0) <> 0
    ORDER BY "balancePence" DESC, t."name" ASC
  `);
}

export default async function TeamCreditsAdminPage({ searchParams }: PageProps) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const saved = getSearchParam(params.saved);
  const error = getSearchParam(params.error);

  const [teams, recentCredits, balances] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId: { not: null } },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        league: { select: { name: true, season: true } },
      },
    }),
    getRecentCredits(),
    getCreditBalances(),
  ]);

  const totalCreditPence = balances.reduce((sum, row) => sum + Math.max(row.balancePence, 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/payments" className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to payments
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Team credits
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Team credit ledger
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Use this when a team has already paid for an abandoned or postponed fixture and the fee should be carried forward to a future fixture.
        </p>
      </div>

      {saved === "credit_added" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Team credit added. The captain will now see it on their payments page and can use it against a future charge.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error === "missing_team" ? "The selected team could not be found." : "Choose a team and enter a valid credit amount."}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Total live credit</div>
          <div className="mt-3 text-3xl font-semibold text-white">{formatMoney(totalCreditPence)}</div>
          <p className="mt-2 text-sm text-emerald-100/75">Current positive credit held across teams.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Teams in credit</div>
          <div className="mt-3 text-3xl font-semibold text-white">{balances.filter((row) => row.balancePence > 0).length}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">Recent ledger rows</div>
          <div className="mt-3 text-3xl font-semibold text-white">{recentCredits.length}</div>
        </div>
      </div>

      <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.05] p-6">
        <form action={addTeamCreditAction} className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Add team credit</h2>
            <p className="mt-2 text-sm text-white/60">
              This does not refund Stripe. It records that SIXFL owes the team credit which can then be used against another fixture charge.
            </p>
          </div>

          <label className="space-y-2 text-sm font-semibold text-white">
            Team
            <select name="teamId" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40">
              <option value="">Choose team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}{team.league ? ` · ${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Credit amount
            <input name="amountPounds" inputMode="decimal" placeholder="40.00" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Note
            <textarea name="description" rows={4} placeholder="Credit carried forward from postponed fixture on ..." className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40" />
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300">
            Add team credit
          </button>
        </form>
      </AdminCard>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Balances</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Teams currently in credit</h2>
        </div>
        <div className="divide-y divide-white/10">
          {balances.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">No team credit balances yet.</div>
          ) : (
            balances.map((row) => (
              <div key={row.teamId} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-semibold text-white">{row.teamName}</div>
                <div className={row.balancePence >= 0 ? "text-emerald-200" : "text-red-200"}>{formatMoney(row.balancePence)}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Ledger</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Recent credit activity</h2>
        </div>
        <div className="divide-y divide-white/10">
          {recentCredits.length === 0 ? (
            <div className="px-6 py-8 text-sm text-white/55">No credit activity yet.</div>
          ) : (
            recentCredits.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-semibold text-white">{entry.teamName} · {formatEntryType(entry.entryType)}</div>
                  <div className="mt-1 text-sm text-white/50">{entry.description || entry.chargeTitle || "No note"}</div>
                  <div className="mt-1 text-xs text-white/35">{formatDate(entry.createdAt)}</div>
                </div>
                <div className={signedAmount(entry.entryType, entry.amountPence) >= 0 ? "font-semibold text-emerald-200" : "font-semibold text-red-200"}>
                  {signedAmount(entry.entryType, entry.amountPence) >= 0 ? "+" : "−"}{formatMoney(Math.abs(entry.amountPence))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
