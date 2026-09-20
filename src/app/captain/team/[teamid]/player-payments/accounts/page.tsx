import Link from "next/link";
import { Prisma } from "@prisma/client";

import CopyPlayerPaymentLinkButton from "@/components/captain/CopyPlayerPaymentLinkButton";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import {
  money,
  visiblePlayerLedgerStateSql,
} from "@/lib/payments/player-ledger";
import { ensurePlayerMatchFeePaymentDetailsForFees } from "@/lib/payments/player-match-fees";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";

type OutstandingRow = {
  feeId: string;
  playerName: string | null;
  balancePence: number;
  owner: string;
  collectionPaused: boolean;
  planStatus: string | null;
  paymentToken: string | null;
  paymentUrl: string | null;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
};

function fixtureDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function activePlan(status: string | null) {
  return Boolean(status && ["ACTIVE", "PAUSED", "REVIEW"].includes(status));
}

export default async function Page({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  let rows = await prisma.$queryRaw<OutstandingRow[]>(Prisma.sql`
    SELECT
      s."feeId",
      s."playerName",
      s."balancePence"::int AS "balancePence",
      s."collectionPaused",
      plan.status AS "planStatus",
      fee."paymentToken",
      fee."paymentUrl",
      fixture."kickoffAt",
      home.name AS "homeTeamName",
      away.name AS "awayTeamName",
      COALESCE(
        'user:' || s."userId",
        'user:' || (
          SELECT CASE WHEN COUNT(DISTINCT m."userId") = 1 THEN MIN(m."userId") ELSE NULL END
          FROM "TeamMemberProfile" p
          JOIN "TeamMember" m ON m.id = p."teamMemberId"
          WHERE p."sourceProspectId" = s."prospectId"
            AND m."teamId" = s."teamId"
        ),
        'member:' || s."teamMemberId",
        'prospect:' || s."prospectId",
        'fee:' || s."feeId"
      ) AS owner
    FROM "PlayerFeeLedgerState" s
    JOIN "PlayerMatchFee" fee ON fee.id = s."feeId"
    JOIN "Fixture" fixture ON fixture.id = s."fixtureId"
    JOIN "Team" home ON home.id = fixture."homeTeamId"
    JOIN "Team" away ON away.id = fixture."awayTeamId"
    LEFT JOIN "PlayerRepaymentPlan" plan ON plan.id = s."planId"
    WHERE s."teamId" = ${teamid}
      AND s."balancePence" > 0
      AND s."deletedAt" IS NULL
      AND fee.status::text = 'OPEN'
      AND ${visiblePlayerLedgerStateSql()}
    ORDER BY s."createdAt", s."feeId"
  `);

  const missingLinkIds = rows
    .filter(
      (row) =>
        !row.collectionPaused &&
        !activePlan(row.planStatus) &&
        (!row.paymentToken || !row.paymentUrl),
    )
    .map((row) => row.feeId);

  if (missingLinkIds.length > 0) {
    await ensurePlayerMatchFeePaymentDetailsForFees(missingLinkIds);
    const refreshed = await prisma.playerMatchFee.findMany({
      where: { id: { in: missingLinkIds } },
      select: { id: true, paymentToken: true, paymentUrl: true },
    });
    const byId = new Map(refreshed.map((fee) => [fee.id, fee]));
    rows = rows.map((row) => {
      const fee = byId.get(row.feeId);
      return fee
        ? { ...row, paymentToken: fee.paymentToken, paymentUrl: fee.paymentUrl }
        : row;
    });
  }

  type Account = {
    feeId: string;
    name: string;
    balance: number;
    fees: OutstandingRow[];
  };

  const accounts = new Map<string, Account>();
  for (const row of rows) {
    const account = accounts.get(row.owner) ?? {
      feeId: row.feeId,
      name: row.playerName || "Historical player",
      balance: 0,
      fees: [],
    };
    account.balance += row.balancePence;
    account.fees.push(row);
    accounts.set(row.owner, account);
  }

  const list = [...accounts.values()].sort(
    (a, b) => b.balance - a.balance || a.name.localeCompare(b.name),
  );
  const totalOutstanding = list.reduce((sum, account) => sum + account.balance, 0);
  const openLinks = rows.filter(
    (row) =>
      !row.collectionPaused &&
      !activePlan(row.planStatus) &&
      Boolean(row.paymentUrl),
  ).length;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-emerald-200 underline"
          href={`/captain/team/${teamid}/payments`}
        >
          Back to team payments
        </Link>
        <Link
          className="text-sm text-white/60 underline"
          href={`/captain/team/${teamid}/player-payments`}
        >
          Open Squad payments
        </Link>
      </div>

      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-200/70">
          Player payments
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Outstanding player payments</h1>
        <p className="mt-3 max-w-4xl text-white/60">
          Every unpaid player fee for this team is grouped by player. Open the
          payment link to check or share the exact request, or open the player
          ledger to see that player&apos;s full balance and history.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
          <div className="text-2xl font-bold">{list.length}</div>
          <div className="mt-1 text-sm text-amber-100/70">
            player{list.length === 1 ? "" : "s"} with money outstanding
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
          <div className="text-2xl font-bold">{money(totalOutstanding)}</div>
          <div className="mt-1 text-sm text-amber-100/70">total player balance</div>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <div className="text-2xl font-bold">{openLinks}</div>
          <div className="mt-1 text-sm text-emerald-100/70">
            active payment link{openLinks === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      {list.length ? (
        <div className="space-y-4">
          {list.map((account) => (
            <section
              key={account.feeId}
              className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{account.name}</h2>
                  <p className="mt-1 text-sm text-white/55">
                    {account.fees.length} unpaid fee{account.fees.length === 1 ? "" : "s"} ·{" "}
                    <strong className="text-amber-100">{money(account.balance)} outstanding</strong>
                  </p>
                </div>
                <Link
                  href={`/captain/team/${teamid}/player-payments/account/${account.feeId}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-black"
                >
                  Open player ledger
                </Link>
              </div>

              <div className="divide-y divide-white/10">
                {account.fees.map((fee) => {
                  const planActive = activePlan(fee.planStatus);
                  const usableLink =
                    !fee.collectionPaused && !planActive ? fee.paymentUrl : null;
                  return (
                    <div
                      key={fee.feeId}
                      className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {fixtureDate(fee.kickoffAt)} · {fee.homeTeamName} vs {fee.awayTeamName}
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          <strong className="text-amber-100">{money(fee.balancePence)} due</strong>
                          {fee.collectionPaused
                            ? " · collection paused"
                            : planActive
                              ? " · repayment arrangement active"
                              : " · payment link open"}
                        </div>
                        {usableLink ? (
                          <div className="mt-2 break-all text-xs text-white/35">
                            {usableLink}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {usableLink ? (
                          <>
                            <a
                              href={usableLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100"
                            >
                              Open payment link ↗
                            </a>
                            <CopyPlayerPaymentLinkButton url={usableLink} />
                          </>
                        ) : (
                          <Link
                            href={`/captain/team/${teamid}/player-payments/account/${account.feeId}`}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70"
                          >
                            Manage in ledger
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-6 text-emerald-100">
          No player fees are currently outstanding.
        </section>
      )}
    </main>
  );
}
