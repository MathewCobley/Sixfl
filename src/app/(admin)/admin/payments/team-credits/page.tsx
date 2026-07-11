// ========================================
// File: src/app/(admin)/admin/payments/team-credits/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { addTeamCredit, syncTeamCreditLedgerSources } from "@/lib/payments/team-credits";
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

async function getRequiredAdminUserId() {
  const { user, session } = await requireAdmin();

  if (user?.id) return user.id;

  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect("/admin/payments/team-credits?error=admin_user_missing");

  const fallbackUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!fallbackUser?.id) redirect("/admin/payments/team-credits?error=admin_user_missing");

  return fallbackUser.id;
}

async function addTeamCreditAction(formData: FormData) {
  "use server";

  const adminUserId = await getRequiredAdminUserId();

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
    createdByUserId: adminUserId,
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

  const teams = await prisma.team.findMany({
    where: { leagueId: { not: null } },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      league: { select: { name: true, season: true } },
    },
  });

  await syncTeamCreditLedgerSources(teams.map((team) => team.id));

  const [recentCredits, balances] = await Promise.all([
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
          Add manual team credit, review credit balances, and track credit used against match fees.
        </p>
      </div>

      {saved === "credit_added" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Team credit added.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {error === "missing_team"
            ? "The selected team could not be found."
            : error === "admin_user_missing"
              ? "Admin user could not be confirmed."
              : "Check the credit details and try again."}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard title="Teams with credit" value={balances.length} />
        <AdminCard title="Total credit" value={formatMoney(totalCreditPence)} />
        <AdminCard title="Ledger entries" value={recentCredits.length} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Add manual team credit</h2>
        <p className="mt-2 text-sm text-white/55">
          Use this when SIXFL owes a team credit that should reduce a future match-fee balance.
        </p>

        <form action={addTeamCreditAction} className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.5fr_1.5fr_auto]">
          <label className="space-y-2 text-sm font-semibold text-white">
            Team
            <select
              name="teamId"
              required
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/50"
            >
              <option value="">Choose team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}{team.league ? ` · ${team.league.name}${team.league.season ? ` ${team.league.season}` : ""}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Amount
            <input
              name="amountPounds"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="10.00"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
            />
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Reason
            <input
              name="description"
              placeholder="For example: refund for abandoned fixture"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/50"
            />
          </label>

          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 lg:self-end"
          >
            Add credit
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Current balances</h2>
        <div className="mt-4 divide-y divide-white/10">
          {balances.length === 0 ? (
            <div className="py-6 text-sm text-white/55">No team credit balances yet.</div>
          ) : (
            balances.map((row) => (
              <div key={row.teamId} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <div className="font-semibold text-white">{row.teamName}</div>
                  <div className="text-xs text-white/45">{row.teamId}</div>
                </div>
                <div className="text-lg font-semibold text-emerald-100">{formatMoney(row.balancePence)}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Recent ledger entries</h2>
        <div className="mt-4 divide-y divide-white/10">
          {recentCredits.length === 0 ? (
            <div className="py-6 text-sm text-white/55">No credit ledger entries yet.</div>
          ) : (
            recentCredits.map((entry) => {
              const signed = signedAmount(entry.entryType, entry.amountPence);
              return (
                <div key={entry.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="font-semibold text-white">{entry.teamName}</div>
                    <div className="mt-1 text-sm text-white/55">
                      {formatEntryType(entry.entryType)} · {entry.description || "No description"}
                    </div>
                    {entry.chargeTitle ? (
                      <div className="mt-1 text-xs text-white/40">Linked charge: {entry.chargeTitle}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-white/35">{formatDate(entry.createdAt)}</div>
                  </div>
                  <div className={signed >= 0 ? "text-lg font-semibold text-emerald-100" : "text-lg font-semibold text-amber-100"}>
                    {signed >= 0 ? "+" : "-"}{formatMoney(Math.abs(signed))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
