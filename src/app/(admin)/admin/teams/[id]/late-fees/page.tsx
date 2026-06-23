// ========================================
// File: src/app/(admin)/admin/teams/[id]/late-fees/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Late Confirmations | SIXFL Admin",
};

type Props = {
  params: Promise<{ id: string }>;
};

type LateConfirmationHistoryRow = {
  fixtureId: string;
  kickoffAt: Date;
  leagueName: string | null;
  leagueSeason: string | null;
  venueName: string | null;
  homeTeamName: string;
  awayTeamName: string;
  confirmationStatus: string | null;
  confirmedAt: Date | null;
  issueRaisedAt: Date | null;
  lastChasedAt: Date | null;
  lateFeeStatus: string | null;
  lateFeeAmountPence: number | null;
  lateFeeNote: string | null;
  lateFeeWarningAt: Date | null;
  lateFeeAppliedAt: Date | null;
  lateFeeWaivedAt: Date | null;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value: Date | null) {
  if (!value) return "—";

  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDeadline(kickoffAt: Date) {
  return new Date(kickoffAt.getTime() - 72 * 60 * 60 * 1000);
}

function getMatchLabel(row: LateConfirmationHistoryRow) {
  return `${row.homeTeamName} vs ${row.awayTeamName}`;
}

function getConfirmationLabel(row: LateConfirmationHistoryRow) {
  const deadline = getDeadline(row.kickoffAt);

  if (row.confirmationStatus === "CONFIRMED" && row.confirmedAt && row.confirmedAt > deadline) {
    return "Confirmed late";
  }

  if (row.confirmationStatus === "CONFIRMED") return "Confirmed on time";
  if (row.confirmationStatus === "ISSUE_RAISED") return "Issue raised";
  if (row.confirmationStatus === "PENDING") return "Awaiting confirmation";
  return "No confirmation";
}

function getDecisionLabel(status: string | null) {
  switch (status) {
    case "APPLIED":
      return "Charge applied";
    case "WAIVED":
      return "Waived";
    case "WARNING":
      return "Warning";
    default:
      return "No decision";
  }
}

function getDecisionTone(status: string | null) {
  switch (status) {
    case "APPLIED":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    case "WAIVED":
      return "border-sky-400/25 bg-sky-500/10 text-sky-100";
    case "WARNING":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    default:
      return "border-white/10 bg-white/5 text-white/55";
  }
}

function formatMoney(amountPence: number | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((amountPence ?? 1000) / 100);
}

async function getTeamLateConfirmationHistory(teamId: string) {
  return prisma.$queryRaw<LateConfirmationHistoryRow[]>(Prisma.sql`
    SELECT
      fixture."id" AS "fixtureId",
      fixture."kickoffAt" AS "kickoffAt",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      venue."name" AS "venueName",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      confirmation."status"::text AS "confirmationStatus",
      confirmation."confirmedAt" AS "confirmedAt",
      confirmation."issueRaisedAt" AS "issueRaisedAt",
      confirmation."lastChasedAt" AS "lastChasedAt",
      fee."status"::text AS "lateFeeStatus",
      fee."amountPence" AS "lateFeeAmountPence",
      fee."note" AS "lateFeeNote",
      fee."warningAt" AS "lateFeeWarningAt",
      fee."appliedAt" AS "lateFeeAppliedAt",
      fee."waivedAt" AS "lateFeeWaivedAt"
    FROM "Fixture" fixture
    INNER JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    INNER JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "League" league ON league."id" = fixture."leagueId"
    LEFT JOIN "Venue" venue ON venue."id" = fixture."venueId"
    LEFT JOIN "FixtureCaptainConfirmation" confirmation
      ON confirmation."fixtureId" = fixture."id"
      AND confirmation."teamId" = ${teamId}
    LEFT JOIN "FixtureConfirmationLateFee" fee
      ON fee."fixtureId" = fixture."id"
      AND fee."teamId" = ${teamId}
    WHERE fixture."homeTeamId" = ${teamId}
       OR fixture."awayTeamId" = ${teamId}
    ORDER BY fixture."kickoffAt" DESC
    LIMIT 80
  `);
}

export default async function TeamLateFeesPage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const rows = await getTeamLateConfirmationHistory(team.id);
  const warnings = rows.filter((row) => row.lateFeeStatus === "WARNING").length;
  const applied = rows.filter((row) => row.lateFeeStatus === "APPLIED").length;
  const waived = rows.filter((row) => row.lateFeeStatus === "WAIVED").length;
  const lateConfirmations = rows.filter((row) => {
    const deadline = getDeadline(row.kickoffAt);
    return row.confirmedAt && row.confirmedAt > deadline;
  }).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-emerald-400/15 bg-white/[0.03] p-6 md:p-8">
        <Link href={`/admin/teams/${team.id}`} className="text-sm text-emerald-300 hover:text-emerald-200">
          ← Back to team
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Team confirmation history
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          {team.name}
        </h1>
        <p className="mt-2 text-sm text-white/55">
          {team.league ? `${team.league.name}${team.league.season ? ` · ${team.league.season}` : ""}` : "No league assigned"}
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/65">
          This is the team-level record for 72-hour fixture confirmations, warnings, waived decisions and applied admin charges.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-amber-100">Warnings: {warnings}</div>
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">Applied: {applied}</div>
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sky-100">Waived: {waived}</div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white/70">Late confirms: {lateConfirmations}</div>
      </div>

      <AdminCard className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/55">
            No fixtures found for this team yet.
          </div>
        ) : null}

        {rows.map((row) => {
          const deadline = getDeadline(row.kickoffAt);
          const decisionAt = row.lateFeeAppliedAt ?? row.lateFeeWaivedAt ?? row.lateFeeWarningAt;

          return (
            <article key={row.fixtureId} className="rounded-3xl border border-white/10 bg-black/20 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
                    {row.leagueName ?? "No league"}{row.leagueSeason ? ` · ${row.leagueSeason}` : ""}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{getMatchLabel(row)}</h2>
                  <p className="mt-1 text-sm text-white/55">{formatDate(row.kickoffAt)} · {row.venueName ?? "Venue TBC"}</p>
                </div>
                <span className={cx("rounded-full border px-3 py-1 text-xs font-semibold", getDecisionTone(row.lateFeeStatus))}>
                  {getDecisionLabel(row.lateFeeStatus)}
                </span>
              </div>

              <div className="mt-5 grid gap-2 text-sm text-white/55 md:grid-cols-2 xl:grid-cols-4">
                <div>Deadline: {formatDate(deadline)}</div>
                <div>Confirmation: {getConfirmationLabel(row)}</div>
                <div>Confirmed: {formatDate(row.confirmedAt)}</div>
                <div>Last chased: {formatDate(row.lastChasedAt)}</div>
                <div>Decision date: {formatDate(decisionAt)}</div>
                <div>Decision value: {formatMoney(row.lateFeeAmountPence)}</div>
              </div>

              {row.lateFeeNote ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/65">
                  {row.lateFeeNote}
                </div>
              ) : null}
            </article>
          );
        })}
      </AdminCard>
    </div>
  );
}
