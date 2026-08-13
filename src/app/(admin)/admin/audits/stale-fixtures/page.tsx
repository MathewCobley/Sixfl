import Link from "next/link";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { markStaleFixtureCompletedAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Stale Fixtures Audit | SIXFL Admin",
};

type StaleFixtureRow = {
  fixtureId: string;
  kickoffAt: Date;
  publishedAt: Date | null;
  leagueId: string;
  leagueName: string;
  season: string | null;
  leagueIsActive: boolean;
  homeTeamName: string;
  awayTeamName: string;
  homePlaceholder: boolean;
  awayPlaceholder: boolean;
  homeScore: number | null;
  awayScore: number | null;
  resultEnteredAt: Date | null;
  paymentChargeCount: number;
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function StaleFixturesAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const fixedMessage = first(sp.fixed).trim();
  const errorMessage = first(sp.error).trim();

  const rows = await prisma.$queryRaw<StaleFixtureRow[]>(Prisma.sql`
    SELECT
      fixture."id" AS "fixtureId",
      fixture."kickoffAt" AS "kickoffAt",
      fixture."publishedAt" AS "publishedAt",
      league."id" AS "leagueId",
      league."name" AS "leagueName",
      league."season" AS "season",
      league."isActive" AS "leagueIsActive",
      home_team."name" AS "homeTeamName",
      away_team."name" AS "awayTeamName",
      COALESCE(home_team."isFixturePlaceholder", false) AS "homePlaceholder",
      COALESCE(away_team."isFixturePlaceholder", false) AS "awayPlaceholder",
      result."homeScore" AS "homeScore",
      result."awayScore" AS "awayScore",
      result."enteredAt" AS "resultEnteredAt",
      (
        SELECT COUNT(*)::int
        FROM "PaymentCharge" charge
        WHERE charge."fixtureId" = fixture."id"
      ) AS "paymentChargeCount"
    FROM "Fixture" fixture
    JOIN "League" league ON league."id" = fixture."leagueId"
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "MatchResult" result ON result."fixtureId" = fixture."id"
    WHERE fixture."status" = 'SCHEDULED'
      AND fixture."kickoffAt" < CURRENT_TIMESTAMP
    ORDER BY fixture."kickoffAt" DESC, league."name" ASC
    LIMIT 500
  `);

  const withResult = rows.filter(
    (row) => row.homeScore !== null && row.awayScore !== null,
  );
  const withoutResult = rows.filter(
    (row) => row.homeScore === null || row.awayScore === null,
  );
  const archivedSeasonCount = new Set(
    rows.filter((row) => !row.leagueIsActive).map((row) => row.leagueId),
  ).size;

  const returnTo = "/admin/audits/stale-fixtures";
  const encodedReturnTo = encodeURIComponent(returnTo);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/80">
            Fixture data health
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Stale fixtures
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-white/60">
            Finds fixtures from any season whose kick-off has already passed but which are still marked Scheduled. You do not need to reopen an archived league to review them.
          </p>
        </div>
        <Link
          href="/admin/fixtures"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Open current fixtures
        </Link>
      </div>

      {fixedMessage ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
          {fixedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/65">Stale scheduled</p>
          <p className="mt-3 text-4xl font-black text-amber-100">{rows.length}</p>
        </div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/65">Result already exists</p>
          <p className="mt-3 text-4xl font-black text-emerald-100">{withResult.length}</p>
        </div>
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-100/65">No result recorded</p>
          <p className="mt-3 text-4xl font-black text-red-100">{withoutResult.length}</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Archived seasons affected</p>
          <p className="mt-3 text-4xl font-black text-white">{archivedSeasonCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.06] px-4 py-3 text-sm leading-6 text-sky-100/80">
        <strong className="text-sky-100">Safe repair rule:</strong> if a result already exists, this page can mark the fixture Completed without changing the score. If no result exists, SIXFL will not guess what happened — use Enter result or Review fixture instead.
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Past fixtures still marked Scheduled</h2>
          <p className="mt-1 text-sm text-white/50">Newest stale records first · up to 500 shown</p>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <div className="text-lg font-semibold text-emerald-200">No stale fixtures found</div>
            <p className="mt-2 text-sm text-white/50">Every past fixture has moved out of Scheduled status.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {rows.map((row) => {
              const hasResult = row.homeScore !== null && row.awayScore !== null;
              const hasPlaceholder = row.homePlaceholder || row.awayPlaceholder;
              return (
                <div key={row.fixtureId} className="grid gap-4 px-5 py-5 xl:grid-cols-[1.3fr_1fr_auto] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{row.homeTeamName} v {row.awayTeamName}</h3>
                      {!row.leagueIsActive ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/55">Archived season</span>
                      ) : null}
                      {hasPlaceholder ? (
                        <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100">Contains TBC</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {row.leagueName}{row.season ? ` · ${row.season}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-white/40">{dateTimeFormatter.format(row.kickoffAt)}</div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {hasResult ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100">
                        Result exists · {row.homeScore}-{row.awayScore}
                      </span>
                    ) : (
                      <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 font-semibold text-red-100">No result</span>
                    )}
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/55">
                      {row.publishedAt ? "Published" : "Draft"}
                    </span>
                    {row.paymentChargeCount > 0 ? (
                      <span className="rounded-full border border-amber-400/15 bg-amber-500/[0.06] px-3 py-1 text-amber-100/70">
                        {row.paymentChargeCount} payment charge{row.paymentChargeCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {hasResult && !hasPlaceholder ? (
                      <form action={markStaleFixtureCompletedAction}>
                        <input type="hidden" name="fixtureId" value={row.fixtureId} />
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center rounded-xl bg-emerald-400 px-4 text-xs font-black text-black transition hover:bg-emerald-300"
                        >
                          Mark completed
                        </button>
                      </form>
                    ) : null}
                    {!hasResult && !hasPlaceholder ? (
                      <Link
                        href={`/admin/fixtures/${row.fixtureId}/result?returnTo=${encodedReturnTo}`}
                        className="inline-flex h-10 items-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                      >
                        Enter result
                      </Link>
                    ) : null}
                    <Link
                      href={`/admin/fixtures/${row.fixtureId}/edit?returnTo=${encodedReturnTo}`}
                      className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-white/75 transition hover:bg-white/[0.08]"
                    >
                      Review fixture
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
