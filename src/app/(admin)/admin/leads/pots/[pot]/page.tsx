// ========================================
// File: src/app/(admin)/admin/leads/pots/[pot]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";
import {
  PLAYER_LEAD_POTS,
  getPlayerLeadPotDefinition,
  isPlayerLeadPotKey,
  playerLeadPotToneClasses,
  type PlayerLeadPotKey,
} from "@/lib/leads/playerLeadPots";
import { movePlayerLeadPotAction } from "../actions";

type PageParams = Promise<{
  pot: string;
}>;

type SearchParams = Promise<{
  leagueId?: string;
}>;

type LeagueOption = {
  id: string;
  name: string;
  season: string | null;
  area: string | null;
};

type LeadRow = {
  id: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  area: string | null;
  source: string | null;
  message: string | null;
  status: string;
  leadPot: PlayerLeadPotKey;
  chaseStage: number;
  createdAt: Date;
  updatedAt: Date;
  contactedAt: Date | null;
  lastChasedAt: Date | null;
  nextChaseDueAt: Date | null;
  confirmedInterestAt: Date | null;
  optionalDetailsRequestedAt: Date | null;
  leagueName: string | null;
  leagueSeason: string | null;
  leagueArea: string | null;
  nights: string | null;
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

function buildPotReturnPath(pot: PlayerLeadPotKey, leagueId?: string) {
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

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-semibold text-white/80">
        {value || "—"}
      </div>
    </div>
  );
}

function MovePotButton({
  leadId,
  nextPot,
  currentPot,
  returnTo,
}: {
  leadId: string;
  nextPot: PlayerLeadPotKey;
  currentPot: PlayerLeadPotKey;
  returnTo: string;
}) {
  const definition = getPlayerLeadPotDefinition(nextPot);
  const classes = playerLeadPotToneClasses(definition.tone);
  const isActive = nextPot === currentPot;

  return (
    <form action={movePlayerLeadPotAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="nextPot" value={nextPot} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        disabled={isActive}
        className={[
          "inline-flex min-h-9 items-center justify-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-[0.12em] transition",
          isActive
            ? `${classes.badge} cursor-default`
            : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white",
        ].join(" ")}
      >
        {definition.shortTitle}
      </button>
    </form>
  );
}

export default async function AdminLeadPotDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: SearchParams;
}) {
  await requireAdmin();

  const resolvedParams = await params;
  const pot = resolvedParams.pot.toUpperCase();

  if (!isPlayerLeadPotKey(pot)) {
    notFound();
  }

  const sp = (await searchParams) ?? {};
  const selectedLeagueId = sp.leagueId?.trim() || undefined;
  const definition = getPlayerLeadPotDefinition(pot);
  const classes = playerLeadPotToneClasses(definition.tone);
  const returnTo = buildPotReturnPath(pot, selectedLeagueId);

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

  const leads = await prisma.$queryRaw<LeadRow[]>`
    SELECT
      l."id",
      l."contactName",
      l."email",
      l."phone",
      l."area",
      l."source",
      l."message",
      l."status"::text AS "status",
      l."leadPot" AS "leadPot",
      l."chaseStage",
      l."createdAt",
      l."updatedAt",
      l."contactedAt",
      l."lastChasedAt",
      l."nextChaseDueAt",
      l."confirmedInterestAt",
      l."optionalDetailsRequestedAt",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason",
      league."area" AS "leagueArea",
      STRING_AGG(nights."night"::text, ', ' ORDER BY nights."createdAt") AS "nights"
    FROM "InterestLead" l
    LEFT JOIN "League" league ON league."id" = l."leagueId"
    LEFT JOIN "InterestLeadPreferredNight" nights ON nights."leadId" = l."id"
    WHERE l."interestType" = 'PLAYER'
      AND l."leadPot" = ${pot}::"LeadPot"
      ${leagueFilter}
    GROUP BY l."id", league."name", league."season", league."area"
    ORDER BY
      CASE
        WHEN l."nextChaseDueAt" IS NOT NULL AND l."nextChaseDueAt" <= NOW() THEN 0
        ELSE 1
      END,
      l."createdAt" DESC
  `;

  const overdueCount = leads.filter(
    (lead) => lead.nextChaseDueAt && lead.nextChaseDueAt <= new Date(),
  ).length;

  return (
    <AdminCard title={definition.title}>
      <div className="space-y-6">
        <div className={`rounded-2xl border p-5 ${classes.card}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
                <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
                  PLAYER POT
                </div>
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
                {definition.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70">
                {definition.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-bold tracking-[0.12em] ${classes.badge}`}
                >
                  {definition.actionLabel}
                </span>
                <span className="inline-flex min-h-9 items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold tracking-[0.12em] text-white/60">
                  {definition.chaseRule}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/leads/pots"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                Back to pots
              </Link>
              <Link
                href="/admin/leads"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                All leads
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DetailPill label="Leads in pot" value={String(leads.length)} />
          <DetailPill label="Overdue chases" value={String(overdueCount)} />
          <DetailPill
            label="League filter"
            value={selectedLeague ? formatLeagueLabel(selectedLeague) : "All leagues"}
          />
          <DetailPill label="Next action" value={definition.actionLabel} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/55">
            LEAGUE FILTER
          </div>
          <div className="mt-1 text-sm text-white/60">
            Filter this pot by a single league without creating separate pot
            systems for each league.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <LeagueChip
              href={`/admin/leads/pots/${pot}`}
              label="All leagues"
              active={!selectedLeagueId}
            />
            {leagues.map((league) => (
              <LeagueChip
                key={league.id}
                href={`/admin/leads/pots/${pot}?leagueId=${league.id}`}
                label={formatLeagueLabel(league)}
                active={selectedLeagueId === league.id}
              />
            ))}
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/60">
            No player leads are currently in this pot.
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="text-xl font-black tracking-tight text-white transition hover:text-emerald-300"
                    >
                      {lead.contactName}
                    </Link>
                    <div className="mt-1 text-sm text-white/55">
                      {lead.leagueName
                        ? `${lead.leagueName}${lead.leagueSeason ? ` — ${lead.leagueSeason}` : ""}`
                        : lead.area || "No league or area set"}
                    </div>
                    {lead.message ? (
                      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/65">
                        {lead.message}
                      </p>
                    ) : null}
                  </div>

                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
                  >
                    Open lead
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <DetailPill label="Email" value={lead.email || "No email"} />
                  <DetailPill label="Phone" value={lead.phone || "No phone"} />
                  <DetailPill label="Preferred nights" value={lead.nights || "—"} />
                  <DetailPill label="Source" value={lead.source || "—"} />
                  <DetailPill label="Chase stage" value={`Stage ${lead.chaseStage}`} />
                  <DetailPill label="Last chased" value={formatDate(lead.lastChasedAt)} />
                  <DetailPill label="Next chase" value={formatDate(lead.nextChaseDueAt)} />
                  <DetailPill label="Created" value={formatDate(lead.createdAt)} />
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                    Move player to pot
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PLAYER_LEAD_POTS.map((targetPot) => (
                      <MovePotButton
                        key={`${lead.id}-${targetPot.key}`}
                        leadId={lead.id}
                        nextPot={targetPot.key}
                        currentPot={lead.leadPot}
                        returnTo={returnTo}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminCard>
  );
}
