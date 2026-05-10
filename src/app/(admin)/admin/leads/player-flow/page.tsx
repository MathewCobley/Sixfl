// ========================================
// File: src/app/(admin)/admin/leads/player-flow/page.tsx
// ========================================

import Link from "next/link";
import { LeadPot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";
import {
  PLAYER_LEAD_FLOW_STATUSES,
  getPlayerLeadFlowStatusForStorageStatus,
  playerLeadFlowToneClasses,
  type LeadPotStorageKey,
  type PlayerLeadFlowStatusKey,
} from "@/lib/leads/playerLeadFlow";

type SearchParams = Promise<{
  leagueId?: string;
}>;

type LeagueOption = {
  id: string;
  name: string;
  season: string | null;
  area: string | null;
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

function playerFlowStatusHref(status: PlayerLeadFlowStatusKey, leagueId?: string) {
  const search = new URLSearchParams();
  if (leagueId) search.set("leagueId", leagueId);
  const query = search.toString();
  return `/admin/leads/player-flow/${status}${query ? `?${query}` : ""}`;
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

function toLeadPotValues(values: LeadPotStorageKey[]) {
  return values as LeadPot[];
}

export default async function AdminPlayerFlowPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const selectedLeagueId = sp.leagueId?.trim() || undefined;
  const now = new Date();

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

  const statusSummaries = await Promise.all(
    PLAYER_LEAD_FLOW_STATUSES.map(async (status) => {
      const where = {
        interestType: "PLAYER" as const,
        leadPot: {
          in: toLeadPotValues(status.storageStatuses),
        },
        ...(selectedLeagueId ? { leagueId: selectedLeagueId } : {}),
      };

      const [total, overdue, oldestLead] = await Promise.all([
        prisma.interestLead.count({ where }),
        prisma.interestLead.count({
          where: {
            ...where,
            nextChaseDueAt: {
              lte: now,
            },
          },
        }),
        prisma.interestLead.findFirst({
          where,
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);

      return {
        status,
        total,
        overdue,
        oldestCreatedAt: oldestLead?.createdAt ?? null,
      };
    }),
  );

  const totalPlayers = statusSummaries.reduce(
    (total, summary) => total + summary.total,
    0,
  );
  const overduePlayers = statusSummaries.reduce(
    (total, summary) => total + summary.overdue,
    0,
  );
  const smsLeadCount =
    statusSummaries.find((summary) => summary.status.key === "SMS_LEAD")?.total ??
    0;
  const activeSquadCount =
    statusSummaries.find(
      (summary) => summary.status.key === "ACTIVE_SQUAD_PLAYER",
    )?.total ?? 0;

  const priorityLeads = await prisma.interestLead.findMany({
    where: {
      interestType: "PLAYER",
      ...(selectedLeagueId ? { leagueId: selectedLeagueId } : {}),
    },
    orderBy: [{ nextChaseDueAt: "asc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      id: true,
      contactName: true,
      email: true,
      phone: true,
      area: true,
      leadPot: true,
      chaseStage: true,
      createdAt: true,
      nextChaseDueAt: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
    },
  });

  return (
    <AdminCard title="Player flow">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-white/65">
              Manage player interest by journey status: SMS lead, active lead,
              pre-activation player, active squad player and unresponsive players.
            </div>
            <div className="mt-1 text-xs text-white/45">
              {selectedLeague
                ? `Filtered to ${formatLeagueLabel(selectedLeague)}.`
                : "Showing the player flow across all leagues."}
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
            label="PLAYER RECORDS"
            value={totalPlayers}
            subtext="All players in the flow"
          />
          <MetricCard
            label="OVERDUE CHASES"
            value={overduePlayers}
            subtext="Needs admin action"
          />
          <MetricCard
            label="SMS LEADS"
            value={smsLeadCount}
            subtext="Mobile-only leads"
          />
          <MetricCard
            label="ACTIVE SQUAD"
            value={activeSquadCount}
            subtext="Squad players to monitor"
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            LEAGUE FILTER
          </div>
          <div className="mt-1 text-sm text-white/60">
            Same player journey, filtered by league.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <LeagueChip
              href="/admin/leads/player-flow"
              label="All leagues"
              active={!selectedLeagueId}
            />
            {leagues.map((league) => (
              <LeagueChip
                key={league.id}
                href={`/admin/leads/player-flow?leagueId=${league.id}`}
                label={formatLeagueLabel(league)}
                active={selectedLeagueId === league.id}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {statusSummaries.map((summary) => {
            const classes = playerLeadFlowToneClasses(summary.status.tone);

            return (
              <div
                key={summary.status.key}
                className={`rounded-2xl border p-4 ${classes.card}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
                      <h2 className="text-lg font-black tracking-tight text-white">
                        {summary.status.title}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-white/65">
                      {summary.status.description}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-3xl font-black tracking-tight text-white">
                      {summary.total}
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                      players
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                      Overdue
                    </div>
                    <div className="mt-1 text-xl font-black text-white">
                      {summary.overdue}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                      Oldest
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white/80">
                      {formatDate(summary.oldestCreatedAt)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                      Chase rule
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white/80">
                      {summary.status.chaseRule}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-bold tracking-[0.12em] ${classes.badge}`}
                  >
                    {summary.status.actionLabel}
                  </span>

                  <Link
                    href={playerFlowStatusHref(summary.status.key, selectedLeagueId)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
                  >
                    View status
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            PRIORITY PLAYER RECORDS
          </div>
          <div className="mt-1 text-sm text-white/60">
            Recent players and due chases rise to the top.
          </div>

          {priorityLeads.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
              No player records in this view yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/5 text-white/65">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">League</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Chase</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityLeads.map((lead) => {
                    const flowStatus = getPlayerLeadFlowStatusForStorageStatus(
                      lead.leadPot as LeadPotStorageKey,
                    );
                    const classes = playerLeadFlowToneClasses(flowStatus.tone);

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
                            href={playerFlowStatusHref(
                              flowStatus.key,
                              selectedLeagueId,
                            )}
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold transition hover:brightness-125 ${classes.badge}`}
                          >
                            {flowStatus.shortTitle}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {lead.league ? (
                            <span>
                              {lead.league.name}
                              {lead.league.season ? ` — ${lead.league.season}` : ""}
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
