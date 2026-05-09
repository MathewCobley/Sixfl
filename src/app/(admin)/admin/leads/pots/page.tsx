// ========================================
// File: src/app/(admin)/admin/leads/pots/page.tsx
// ========================================

import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";
import {
  PLAYER_LEAD_POTS,
  playerLeadPotToneClasses,
  type PlayerLeadPotKey,
} from "@/lib/leads/playerLeadPots";

type SearchParams = Promise<{
  leagueId?: string;
}>;

type LeagueOption = {
  id: string;
  name: string;
  season: string | null;
  area: string | null;
};

type PotSummaryRow = {
  leadPot: PlayerLeadPotKey;
  total: bigint;
  overdue: bigint;
  oldestCreatedAt: Date | null;
  oldestNextChaseDueAt: Date | null;
};

type PriorityLeadRow = {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  area: string | null;
  leadPot: PlayerLeadPotKey;
  chaseStage: number;
  createdAt: Date;
  nextChaseDueAt: Date | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

function formatDate(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatLeagueLabel(league: LeagueOption) {
  return `${league.name}${league.season ? ` — ${league.season}` : ""}${
    league.area ? ` · ${league.area}` : ""
  }`;
}

function potHref(pot: PlayerLeadPotKey, leagueId?: string) {
  const search = new URLSearchParams();
  if (leagueId) search.set("leagueId", leagueId);
  const query = search.toString();
  return `/admin/leads/pots/${pot}${query ? `?${query}` : ""}`;
}

function LeagueChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex min-h-10 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold tracking-[0.14em] transition",
        active
          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
          : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function MetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: number;
  subtext: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] font-bold tracking-[0.18em] text-white/50">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black tracking-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-sm text-white/55">{subtext}</div>
    </div>
  );
}

export default async function AdminLeadPotsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const selectedLeagueId = sp.leagueId?.trim() || undefined;

  const leagues = await prisma.league.findMany({
    where: {
      interestLeads: {
        some: {
          interestType: "PLAYER",
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
      area: true,
    },
  });

  const selectedLeague = selectedLeagueId
    ? leagues.find((league) => league.id === selectedLeagueId)
    : undefined;

  const leagueFilter = selectedLeagueId
    ? Prisma.sql`AND l."leagueId" = ${selectedLeagueId}`
    : Prisma.empty;

  const [summaryRows, priorityLeads] = await Promise.all([
    prisma.$queryRaw<PotSummaryRow[]>`
      SELECT
        l."leadPot" AS "leadPot",
        COUNT(*) AS "total",
        COUNT(*) FILTER (
          WHERE l."nextChaseDueAt" IS NOT NULL
          AND l."nextChaseDueAt" <= NOW()
        ) AS "overdue",
        MIN(l."createdAt") AS "oldestCreatedAt",
        MIN(l."nextChaseDueAt") FILTER (
          WHERE l."nextChaseDueAt" IS NOT NULL
        ) AS "oldestNextChaseDueAt"
      FROM "InterestLead" l
      WHERE l."interestType" = 'PLAYER'
      ${leagueFilter}
      GROUP BY l."leadPot"
    `,
    prisma.$queryRaw<PriorityLeadRow[]>`
      SELECT
        l."id",
        l."contactName",
        l."email",
        l."phone",
        l."area",
        l."leadPot" AS "leadPot",
        l."chaseStage",
        l."createdAt",
        l."nextChaseDueAt",
        league."name" AS "leagueName",
        league."season" AS "leagueSeason"
      FROM "InterestLead" l
      LEFT JOIN "League" league ON league."id" = l."leagueId"
      WHERE l."interestType" = 'PLAYER'
      ${leagueFilter}
      ORDER BY
        CASE
          WHEN l."leadPot" = 'READY_TO_PLACE' THEN 0
          WHEN l."nextChaseDueAt" IS NOT NULL AND l."nextChaseDueAt" <= NOW() THEN 1
          WHEN l."leadPot" = 'NEW_INTEREST' THEN 2
          ELSE 3
        END,
        l."createdAt" DESC
      LIMIT 12
    `,
  ]);

  const summaryByPot = new Map<PlayerLeadPotKey, PotSummaryRow>();

  for (const row of summaryRows) {
    summaryByPot.set(row.leadPot, row);
  }

  const totalPlayers = summaryRows.reduce(
    (total, row) => total + Number(row.total),
    0,
  );
  const overduePlayers = summaryRows.reduce(
    (total, row) => total + Number(row.overdue),
    0,
  );
  const readyToPlace = Number(
    summaryByPot.get("READY_TO_PLACE")?.total ?? BigInt(0),
  );
  const mobileOnly = Number(
    summaryByPot.get("MOBILE_ONLY_NEEDS_EMAIL")?.total ?? BigInt(0),
  );

  return (
    <AdminCard title="Player lead pots">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-white/65">
              Manage player interest as a proper pipeline: capture first,
              confirm intent, request optional details, then place into squads.
            </div>
            <div className="mt-1 text-xs text-white/45">
              {selectedLeague
                ? `Filtered to ${formatLeagueLabel(selectedLeague)}.`
                : "Showing player pots across all leagues."}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/leads"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-medium text-white/80 hover:bg-black/30 hover:text-white"
            >
              Back to leads
            </Link>
            <Link
              href="/admin/leads/new"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Add player lead
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="PLAYER LEADS"
            value={totalPlayers}
            subtext="Captured player interest"
          />
          <MetricCard
            label="OVERDUE CHASES"
            value={overduePlayers}
            subtext="Needs admin action"
          />
          <MetricCard
            label="READY TO PLACE"
            value={readyToPlace}
            subtext="Can be added to a squad"
          />
          <MetricCard
            label="MOBILE ONLY"
            value={mobileOnly}
            subtext="Need email confirmation"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            LEAGUE FILTER
          </div>
          <div className="mt-1 text-sm text-white/60">
            Same pots, filtered by league. This keeps the system tidy while still
            showing each league build clearly.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <LeagueChip
              href="/admin/leads/pots"
              label="All leagues"
              active={!selectedLeagueId}
            />
            {leagues.map((league) => (
              <LeagueChip
                key={league.id}
                href={`/admin/leads/pots?leagueId=${league.id}`}
                label={formatLeagueLabel(league)}
                active={selectedLeagueId === league.id}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {PLAYER_LEAD_POTS.map((pot) => {
            const summary = summaryByPot.get(pot.key);
            const total = Number(summary?.total ?? BigInt(0));
            const overdue = Number(summary?.overdue ?? BigInt(0));
            const classes = playerLeadPotToneClasses(pot.tone);

            return (
              <div
                key={pot.key}
                className={`rounded-2xl border p-4 ${classes.card}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
                      <h2 className="text-lg font-black tracking-tight text-white">
                        {pot.title}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">
                      {pot.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-3xl font-black tracking-tight text-white">
                      {total}
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                      leads
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                      Overdue
                    </div>
                    <div className="mt-1 text-xl font-black text-white">
                      {overdue}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                      Oldest
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white/80">
                      {formatDate(summary?.oldestCreatedAt ?? null)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                      Chase rule
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white/80">
                      {pot.chaseRule}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-bold tracking-[0.12em] ${classes.badge}`}
                  >
                    {pot.actionLabel}
                  </span>

                  <Link
                    href={potHref(pot.key, selectedLeagueId)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
                  >
                    View pot
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            PRIORITY PLAYER LEADS
          </div>
          <div className="mt-1 text-sm text-white/60">
            Ready-to-place players, overdue chases and fresh player interest rise
            to the top.
          </div>

          {priorityLeads.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
              No player leads in this view yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-white/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Pot</th>
                    <th className="px-4 py-3 font-semibold">League</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Chase</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityLeads.map((lead) => {
                    const pot = PLAYER_LEAD_POTS.find(
                      (item) => item.key === lead.leadPot,
                    );
                    const classes = playerLeadPotToneClasses(
                      pot?.tone ?? "slate",
                    );

                    return (
                      <tr
                        key={lead.id}
                        className="border-t border-white/10 text-white/80"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/leads/${lead.id}`}
                            className="font-semibold text-white hover:text-emerald-300"
                          >
                            {lead.contactName}
                          </Link>
                          <div className="text-xs text-white/45">
                            {lead.area || "No area set"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={potHref(lead.leadPot, selectedLeagueId)}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold transition hover:brightness-125 ${classes.badge}`}
                          >
                            {pot?.shortTitle ?? lead.leadPot}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {lead.leagueName ? (
                            <span>
                              {lead.leagueName}
                              {lead.leagueSeason ? ` — ${lead.leagueSeason}` : ""}
                            </span>
                          ) : (
                            <span className="text-white/45">No league</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          <div>{lead.email || "No email"}</div>
                          <div className="text-xs text-white/45">
                            {lead.phone || "No phone"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">
                            Stage {lead.chaseStage}
                          </div>
                          <div className="text-xs text-white/45">
                            Due {formatDate(lead.nextChaseDueAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {formatDate(lead.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminCard>
  );
}
