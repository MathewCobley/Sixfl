import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, TeamMode } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { moveKitFundBackToTeamCreditByAdmin } from "@/lib/kits/kit-fund";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = { title: "Kit Funds | SIXFL Admin" };

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type KitFundBalanceRow = {
  teamId: string;
  teamName: string;
  balancePence: number;
};

type KitFundEntryRow = {
  id: string;
  teamId: string;
  teamName: string;
  entryType: string;
  amountPence: number;
  sourceType: string | null;
  description: string | null;
  createdAt: Date;
};

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
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
  if (type === "FUND_ADDED") return "Added to kit fund";
  if (type === "FUND_USED") return "Left kit fund";
  if (type === "FUND_RESTORED") return "Restored to kit fund";
  return type.replaceAll("_", " ");
}

function signedAmount(type: string, amountPence: number) {
  return type === "FUND_USED" ? -amountPence : amountPence;
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

async function getRequiredAdminUserId() {
  const { user, session } = await requireAdmin();
  if (user?.id) return user.id;

  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect("/admin/payments/kit-funds?error=admin_user_missing");

  const fallbackUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!fallbackUser?.id) {
    redirect("/admin/payments/kit-funds?error=admin_user_missing");
  }
  return fallbackUser.id;
}

async function moveBackToTeamCreditAction(formData: FormData) {
  "use server";

  const adminUserId = await getRequiredAdminUserId();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const amountPounds = Number(formData.get("amountPounds") ?? "0");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!teamId || !Number.isFinite(amountPounds) || amountPounds <= 0) {
    redirect("/admin/payments/kit-funds?error=invalid");
  }

  try {
    await moveKitFundBackToTeamCreditByAdmin({
      teamId,
      amountPence: Math.round(amountPounds * 100),
      createdByUserId: adminUserId,
      reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid";
    redirect(`/admin/payments/kit-funds?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/payments/kit-funds");
  revalidatePath("/admin/payments/team-credits");
  revalidatePath(`/captain/team/${teamId}/payments`);
  revalidatePath(`/captain/team/${teamId}/kit`);
  redirect("/admin/payments/kit-funds?saved=returned");
}

async function getKitFundBalances() {
  return prisma.$queryRaw<KitFundBalanceRow[]>(Prisma.sql`
    SELECT
      t."id" AS "teamId",
      t."name" AS "teamName",
      COALESCE(SUM(
        CASE
          WHEN entry."entryType" = 'FUND_USED' THEN -entry."amountPence"
          ELSE entry."amountPence"
        END
      ), 0)::int AS "balancePence"
    FROM "KitFundLedgerEntry" entry
    JOIN "Team" t ON t."id" = entry."teamId"
    GROUP BY t."id", t."name"
    HAVING COALESCE(SUM(
      CASE
        WHEN entry."entryType" = 'FUND_USED' THEN -entry."amountPence"
        ELSE entry."amountPence"
      END
    ), 0) <> 0
    ORDER BY "balancePence" DESC, t."name" ASC
  `);
}

async function getRecentKitFundEntries() {
  return prisma.$queryRaw<KitFundEntryRow[]>(Prisma.sql`
    SELECT
      entry."id",
      entry."teamId",
      t."name" AS "teamName",
      entry."entryType"::text AS "entryType",
      entry."amountPence",
      entry."sourceType",
      entry."description",
      entry."createdAt"
    FROM "KitFundLedgerEntry" entry
    JOIN "Team" t ON t."id" = entry."teamId"
    ORDER BY entry."createdAt" DESC, entry."id" DESC
    LIMIT 100
  `);
}

export default async function KitFundsAdminPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = (await searchParams) ?? {};
  const saved = getSearchParam(params.saved);
  const error = getSearchParam(params.error);

  const [teams, balances, recentEntries] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId: { not: null }, teamMode: TeamMode.STANDARD },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        league: { select: { name: true, season: true } },
      },
    }),
    getKitFundBalances(),
    getRecentKitFundEntries(),
  ]);

  const totalPence = balances.reduce(
    (sum, row) => sum + Math.max(row.balancePence, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin/payments" className="text-sm font-medium text-sky-300 hover:text-sky-200">
          ← Back to payments
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300/80">
          Kit funds
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Team kit fund ledger
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Kit fund money has been deliberately moved out of match-fee team credit and is reserved for SIXFL kits. Review every movement here and use the correction form only when a captain moved money by mistake.
        </p>
      </div>

      {saved === "returned" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Kit fund money moved back to team credit as an admin correction.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {decodeURIComponent(error)}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard title="Teams with kit fund" value={balances.filter((row) => row.balancePence > 0).length} />
        <SummaryCard title="Total reserved for kits" value={formatMoney(totalPence)} />
        <SummaryCard title="Recent movements" value={recentEntries.length} />
      </div>

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-5">
        <h2 className="text-xl font-semibold text-white">Correct a mistaken transfer</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Captains cannot move kit fund money back themselves. Use this only to correct a genuine mistake; the return is written to both ledgers for audit.
        </p>
        <form action={moveBackToTeamCreditAction} className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_0.55fr_1.5fr_auto]">
          <label className="space-y-2 text-sm font-semibold text-white">
            Team
            <select name="teamId" required className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-amber-400/50">
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
            <input name="amountPounds" type="number" min="0.01" step="0.01" required placeholder="20.00" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none focus:border-amber-400/50" />
          </label>
          <label className="space-y-2 text-sm font-semibold text-white">
            Correction reason
            <input name="reason" required placeholder="For example: captain moved the wrong £20" className="h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/50" />
          </label>
          <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200 lg:self-end">
            Return to team credit
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Current kit fund balances</h2>
        <div className="mt-4 divide-y divide-white/10">
          {balances.length === 0 ? (
            <div className="py-6 text-sm text-white/55">No kit fund balances yet.</div>
          ) : (
            balances.map((row) => (
              <div key={row.teamId} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <div className="font-semibold text-white">{row.teamName}</div>
                  <div className="text-xs text-white/40">{row.teamId}</div>
                </div>
                <div className={row.balancePence >= 0 ? "text-lg font-semibold text-sky-100" : "text-lg font-semibold text-red-100"}>
                  {formatMoney(row.balancePence)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <h2 className="text-xl font-semibold text-white">Recent kit fund activity</h2>
        <div className="mt-4 divide-y divide-white/10">
          {recentEntries.length === 0 ? (
            <div className="py-6 text-sm text-white/55">No kit fund movements yet.</div>
          ) : (
            recentEntries.map((entry) => {
              const signed = signedAmount(entry.entryType, entry.amountPence);
              return (
                <div key={entry.id} className="grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="font-semibold text-white">{entry.teamName}</div>
                    <div className="mt-1 text-sm text-white/55">
                      {formatEntryType(entry.entryType)} · {entry.description || "No description"}
                    </div>
                    {entry.sourceType ? (
                      <div className="mt-1 text-xs text-white/40">Source: {entry.sourceType.replaceAll("_", " ")}</div>
                    ) : null}
                    <div className="mt-1 text-xs text-white/35">{formatDate(entry.createdAt)}</div>
                  </div>
                  <div className={signed >= 0 ? "text-lg font-semibold text-emerald-100" : "text-lg font-semibold text-amber-100"}>
                    {signed >= 0 ? "+" : "−"}{formatMoney(Math.abs(signed))}
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
