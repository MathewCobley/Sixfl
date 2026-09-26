import Link from "next/link";
import { Prisma } from "@prisma/client";

import CopyPlayerPaymentLinkButton from "@/components/captain/CopyPlayerPaymentLinkButton";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getHistoricalPlayerFeeIdentities } from "@/lib/payments/player-fee-identity";
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
  resolvedName?: string;
  identityMissing?: boolean;
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

  const unresolvedIds = rows
    .filter((row) => !row.playerName?.trim())
    .map((row) => row.feeId);
  const historicalIdentities = await getHistoricalPlayerFeeIdentities(unresolvedIds);
  rows = rows.map((row) => {
    const historical = historicalIdentities.get(row.feeId);
    const resolvedName =
      row.playerName?.trim() ||
      historical?.displayName ||
      historical?.email ||
      historical?.phone ||
      "Player identity needs SIXFL review";
    return {
      ...row,
      resolvedName,
      identityMissing:
        !row.playerName?.trim() &&
        !historical?.displayName &&
        !historical?.email &&
        !historical?.phone,
    };
  });

  const missingLinkIds = rows
    .filter(
      (row) =>
        !row.identityMissing &&
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
    identityMissing: boolean;
  };

  const accounts = new Map<string, Account>();
  for (const row of rows) {
    const historical = historicalIdentities.get(row.feeId);
    const recoveredOwner =
      !row.playerName?.trim() && historical?.email
        ? `historical-email:${historical.email.toLowerCase()}`
        : !row.playerName?.trim() && historical?.phone
          ? `historical-phone:${historical.phone}`
          : row.owner;
    const account = accounts.get(recoveredOwner) ?? {
      feeId: row.feeId,
      name: row.resolvedName || "Player identity needs SIXFL review",
      balance: 0,
      fees: [],
      identityMissing: Boolean(row.identityMissing),
    };
    account.balance += row.balancePence;
    account.fees.push(row);
    account.identityMissing = account.identityMissing && Boolean(row.identityMissing);
    accounts.set(recoveredOwner, account);
  }

  const list = [...accounts.values()].sort(
    (a, b) => b.balance - a.balance || a.name.localeCompare(b.name),
  );
  const totalOutstanding = list.reduce((sum, account) => sum + account.balance, 0);
  const openLinks = rows.filter(
    (row) =>
      !row.collectionPaused &&
      !activePlan(row.planStatus) &&
      !row.identityMissing &&
      Boolean(row.paymentUrl),
  ).length;

  return (
    <>
      <style>{`
        body:has(.captain-app-header) .captain-outstanding-player-payments { max-width:40rem !important; padding:.25rem 0 5.5rem !important; display:grid; gap:.65rem; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div:first-child { display:grid !important; grid-template-columns:1fr 1fr !important; gap:.5rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div:first-child a { min-height:2.65rem; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.09); border-radius:.8rem; background:rgba(255,255,255,.035); text-decoration:none; font-size:.7rem; font-weight:800; }
        body:has(.captain-app-header) .captain-outstanding-player-payments header h1 { margin-top:.2rem !important; font-size:1.15rem !important; font-weight:800 !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments header p:last-child { margin-top:.35rem !important; font-size:.7rem !important; line-height:1.1rem !important; color:rgba(255,255,255,.43) !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > section.grid { grid-template-columns:repeat(3,minmax(0,1fr)) !important; gap:.4rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > section.grid > div { padding:.65rem !important; border-radius:.85rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > section.grid > div > div:first-child { font-size:1rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > section.grid > div > div:last-child { margin-top:.15rem !important; font-size:.55rem !important; line-height:.8rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div.space-y-4 { display:grid !important; gap:.55rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div.space-y-4 > section { border-radius:1.05rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div.space-y-4 > section > div:first-child { padding:.75rem .85rem !important; display:grid !important; grid-template-columns:minmax(0,1fr) auto !important; align-items:center !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div.space-y-4 > section h2 { font-size:.85rem !important; font-weight:800 !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments > div.space-y-4 > section > div:last-child > div { padding:.75rem .85rem !important; grid-template-columns:minmax(0,1fr) !important; gap:.55rem !important; }
        body:has(.captain-app-header) .captain-outstanding-player-payments a[class*="min-h-"],
        body:has(.captain-app-header) .captain-outstanding-player-payments button { min-height:2.55rem !important; border-radius:.75rem !important; font-size:.68rem !important; font-weight:800 !important; }
      `}</style>
      <main className="captain-outstanding-player-payments mx-auto max-w-6xl space-y-6 p-5 text-white">
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
                {account.identityMissing ? (
                  <span className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-100">
                    SIXFL needs to identify this player
                  </span>
                ) : (
                  <Link
                    href={`/captain/team/${teamid}/player-payments/account/${account.feeId}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-black"
                  >
                    Open player ledger
                  </Link>
                )}
              </div>

              <div className="divide-y divide-white/10">
                {account.fees.map((fee) => {
                  const planActive = activePlan(fee.planStatus);
                  const usableLink =
                    !fee.identityMissing && !fee.collectionPaused && !planActive
                      ? fee.paymentUrl
                      : null;
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
                          {fee.identityMissing
                            ? " · player identity needs SIXFL review"
                            : fee.collectionPaused
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
                        ) : fee.identityMissing ? (
                          <span className="inline-flex min-h-9 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                            Payment link hidden until identified
                          </span>
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
    </>
  );
}
