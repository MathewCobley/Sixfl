// ========================================
// File: src/app/(admin)/admin/payments/team-credits/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { addTeamCredit, syncLegacyTeamCreditPotEntries } from "@/lib/payments/team-credits";
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

  await syncLegacyTeamCreditPotEntries(teams.map((team) => team.id));

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
              ? "Could not identify the admin user adding this credit. Please sign out and back in."
              : "Enter a team and a positive credit amount."}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">Total active credit</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatMoney(totalCreditPence)}</p>
          <p className="mt-2 text-sm text-emerald-100/75">Across teams with a positive balance.</p>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Teams with credit</p>
          <p className="mt-3 text-3xl font-semibold text-white">{balances.length}</p>
          <p className="mt-2 text-sm text-white/60">Current non-zero credit balances.</p>
        </AdminCard>
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Ledger entries</p>
          <p className="mt-3 text-3xl font-semibold text-white">{recentCredits.length}</p>
          <p className="mt-2 text-sm text-white/60">Most recent credit movements shown below.</p>
        </AdminCard>
      </section>

      <AdminCard className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Add manual credit</h2>
        <form action={addTeamCreditAction} className="mt-5 grid gap-4 lg:grid-cols-[1fr_10rem_1fr_auto] lg:items-end">
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
            Credit £
            <input name="amountPounds" type="number" min="0.01" step="0.01" placeholder="40.00" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
          </label>

          <label className="space-y-2 text-sm font-semibold text-white">
            Note
            <input name="description" placeholder="Reason for credit" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-400/40" />
          </label>

          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">
            Add credit
          </button>
        </form>
      </AdminCard>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">Current balances</h2>
          <div className="mt-4 divide-y divide-white/10">
            {balances.length === 0 ? (
              <div className="py-8 text-sm text-white/55">No team credit balances yet.</div>
            ) : (
              balances.map((row) => (
                <div key={row.teamId} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="font-semibold text-white">{row.teamName}</div>
                  <div className={row.balancePence > 0 ? "font-semibold text-emerald-200" : "font-semibold text-red-200"}>
                    {formatMoney(row.balancePence)}
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>

        <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-semibold text-white">Recent credit movements</h2>
          <div className="mt-4 divide-y divide-white/10">
            {recentCredits.length === 0 ? (
              <div className="py-8 text-sm text-white/55">No credit movements yet.</div>
            ) : (
              recentCredits.map((entry) => (
                <div key={entry.id} className="py-4 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white">{entry.teamName}</div>
                      <div className="mt-1 text-white/50">{formatEntryType(entry.entryType)} · {formatDate(entry.createdAt)}</div>
                      {entry.description ? <div className="mt-1 text-white/45">{entry.description}</div> : null}
                      {entry.chargeTitle ? <div className="mt-1 text-white/45">Charge: {entry.chargeTitle}</div> : null}
                    </div>
                    <div className={signedAmount(entry.entryType, entry.amountPence) >= 0 ? "font-semibold text-emerald-200" : "font-semibold text-red-200"}>
                      {formatMoney(signedAmount(entry.entryType, entry.amountPence))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}
