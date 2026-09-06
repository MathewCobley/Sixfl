// ========================================
// File: src/app/(admin)/admin/leagues/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";

import TeamBadge from "@/components/admin/TeamBadge";
import LeagueForm from "@/components/admin/leagues/LeagueForm";
import {
  getLeagueDivisions,
  getTeamDivisionMap,
} from "@/lib/league-divisions";
import {
  getPlayerEntryStatusLabel,
  getTeamEntryStatusLabel,
  type PlayerEntryStatus,
  type TeamEntryStatus,
} from "@/lib/leagues/entry-status";
import { getTeamContactSnapshot } from "@/lib/notifications/team-contacts";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { updateLeagueAction } from "@/app/(admin)/admin/leagues/actions";
import {
  createDefaultDivisionsAction,
  createLeagueDivisionAction,
} from "./division-actions";
import { updateTeamDivisionAction } from "./team-division-actions";
import { updateLeagueEntryStatusAction } from "./entry-status-actions";

function formatDay(dayOfWeek: string | null) {
  if (!dayOfWeek) return "—";
  switch (dayOfWeek) {
    case "MONDAY": return "Monday";
    case "TUESDAY": return "Tuesday";
    case "WEDNESDAY": return "Wednesday";
    case "THURSDAY": return "Thursday";
    case "FRIDAY": return "Friday";
    case "SATURDAY": return "Saturday";
    case "SUNDAY": return "Sunday";
    case "ANY": return "Any";
    default: return dayOfWeek;
  }
}

function formatLeagueType(leagueType: string | null) {
  if (!leagueType) return "—";
  switch (leagueType) {
    case "MENS": return "Mens";
    case "WOMENS": return "Womens";
    case "YOUTH": return "Youth";
    default: return leagueType;
  }
}

function formatDateForInput(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function formatDisplayDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(value);
}

function formatPoundsFromPence(value: number | null) {
  if (value === null) return "";
  return (value / 100).toFixed(value % 100 === 0 ? 0 : 2);
}

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: value % 100 === 0 ? 0 : 2 }).format(value / 100);
}

function normaliseTeamEntryStatus(value: string | null): TeamEntryStatus {
  return value === "WAITING_LIST" || value === "CLOSED" ? value : "OPEN";
}

function normalisePlayerEntryStatus(value: string | null): PlayerEntryStatus {
  return value === "CLOSED" ? "CLOSED" : "OPEN";
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type LeagueSettingsRow = {
  requiredRefereesPerNight: number;
  proposedStartDate: Date | null;
  minutesPerGame: number | null;
  costPerTeamPerMatchPence: number | null;
  targetTeamCount: number | null;
  bookedPitchCount: number | null;
  bookingStartTime: string | null;
  bookingEndTime: string | null;
  pitchCostPerHourOverridePence: number | null;
  teamEntryStatus: string | null;
  playerEntryStatus: string | null;
};

export default async function EditLeaguePage({ params, searchParams }: Props) {
  await requireAdmin();

  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  const [league, settingsRows, divisions, teamDivisionMap] = await Promise.all([
    prisma.league.findUnique({
      where: { id },
      include: {
        teams: {
          select: { id: true, name: true, logoUrl: true, claimCode: true, createdAt: true, captainUserId: true, captainLinkedAt: true, captainClaimedAt: true },
          orderBy: { name: "asc" },
        },
        _count: { select: { teams: true, fixtures: true, interestLeads: true } },
      },
    }),
    prisma.$queryRaw<Array<LeagueSettingsRow>>(Prisma.sql`
      SELECT
        COALESCE("requiredRefereesPerNight", 1)::int AS "requiredRefereesPerNight",
        "proposedStartDate" AS "proposedStartDate",
        "minutesPerGame"::int AS "minutesPerGame",
        "costPerTeamPerMatchPence"::int AS "costPerTeamPerMatchPence",
        "targetTeamCount"::int AS "targetTeamCount",
        "bookedPitchCount"::int AS "bookedPitchCount",
        "bookingStartTime" AS "bookingStartTime",
        "bookingEndTime" AS "bookingEndTime",
        "pitchCostPerHourOverridePence"::int AS "pitchCostPerHourOverridePence",
        COALESCE("teamEntryStatus", 'OPEN') AS "teamEntryStatus",
        COALESCE("playerEntryStatus", 'OPEN') AS "playerEntryStatus"
      FROM "League"
      WHERE id = ${id}
      LIMIT 1
    `),
    getLeagueDivisions(id),
    getTeamDivisionMap(id),
  ]);

  if (!league) notFound();

  const settings = settingsRows[0] ?? { requiredRefereesPerNight: 1, proposedStartDate: null, minutesPerGame: null, costPerTeamPerMatchPence: null, targetTeamCount: null, bookedPitchCount: null, bookingStartTime: null, bookingEndTime: null, pitchCostPerHourOverridePence: null, teamEntryStatus: "OPEN", playerEntryStatus: "OPEN" };
  const teamEntryStatus = normaliseTeamEntryStatus(settings.teamEntryStatus);
  const playerEntryStatus = normalisePlayerEntryStatus(settings.playerEntryStatus);
  const teamContacts = await Promise.all(league.teams.map((team) => getTeamContactSnapshot(team.id)));
  const contactMap = new Map<string, NonNullable<(typeof teamContacts)[number]>>();
  for (const snapshot of teamContacts) if (snapshot) contactMap.set(snapshot.teamId, snapshot);

  const boundUpdateAction = updateLeagueAction.bind(null, league.id);
  const created = resolvedSearchParams?.created === "1";
  const entryStatusUpdated = resolvedSearchParams?.entryStatus === "updated";
  const divisionsUpdated = typeof resolvedSearchParams?.divisions === "string";
  const divisionError = typeof resolvedSearchParams?.divisionError === "string" ? resolvedSearchParams.divisionError : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link href="/admin/leagues" className="text-sm text-emerald-300 hover:text-emerald-200">← Back to leagues</Link>
          <h1 className="text-3xl font-semibold text-white">{league.name}</h1>
          <p className="text-sm text-white/60">Admin view for this league. Edit settings, manage divisions, review linked teams, and manage the live setup.</p>
        </div>
        <div className="flex flex-wrap gap-3"><Link href="/admin/teams/new" className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">Add team</Link><Link href={`/leagues/${league.slug}`} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">View public page</Link></div>
      </div>
      {created ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">League created successfully.</div> : null}
      {entryStatusUpdated ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">League entry status updated.</div> : null}
      {divisionsUpdated ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">League divisions updated.</div> : null}
      {divisionError ? <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">Division update failed. Check the division name and selected team assignment.</div> : null}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold text-white">League settings</h2>
            <LeagueForm mode="edit" action={boundUpdateAction} initialValues={{ name: league.name, slug: league.slug, season: league.season ?? "", isActive: league.isActive, isMoving: league.isMoving, area: league.area ?? "", dayOfWeek: league.dayOfWeek ?? "", leagueType: league.leagueType ?? "", venueName: league.venueName ?? "", proposedStartDate: formatDateForInput(settings.proposedStartDate), minutesPerGame: settings.minutesPerGame ? String(settings.minutesPerGame) : "", costPerTeamPerMatch: formatPoundsFromPence(settings.costPerTeamPerMatchPence), targetTeamCount: settings.targetTeamCount ? String(settings.targetTeamCount) : "", requiredRefereesPerNight: String(settings.requiredRefereesPerNight), bookedPitchCount: settings.bookedPitchCount ? String(settings.bookedPitchCount) : "", bookingStartTime: settings.bookingStartTime ?? "", bookingEndTime: settings.bookingEndTime ?? "", pitchCostPerHourOverride: formatPoundsFromPence(settings.pitchCostPerHourOverridePence), kickoffInfo: league.kickoffInfo ?? "", format: league.format ?? "", surface: league.surface ?? "", description: league.description ?? "", heroImageUrl: league.heroImageUrl ?? "", badgeUrl: league.badgeUrl ?? "", ctaText: league.ctaText ?? "" }} />
          </div>
          <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Entry status</h2>
                <p className="mt-1 text-sm text-white/60">Use this when a league is full for teams but still open for individual players.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 font-semibold text-amber-100">{getTeamEntryStatusLabel(teamEntryStatus)}</span>
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-100">{getPlayerEntryStatusLabel(playerEntryStatus)}</span>
              </div>
            </div>
            <form action={updateLeagueEntryStatusAction} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <input type="hidden" name="leagueId" value={league.id} />
              <label className="space-y-2 text-sm text-white/70">
                <span>Team entries</span>
                <select name="teamEntryStatus" defaultValue={teamEntryStatus} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-amber-400/50">
                  <option value="OPEN">Open</option>
                  <option value="WAITING_LIST">Waiting list only</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-white/70">
                <span>Player registrations</span>
                <select name="playerEntryStatus" defaultValue={playerEntryStatus} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-amber-400/50">
                  <option value="OPEN">Open</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </label>
              <button type="submit" className="rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-200">Save status</button>
            </form>
          </div>
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h2 className="text-lg font-semibold text-white">Divisions</h2><p className="mt-1 text-sm text-white/60">Use divisions when one league has separate tables and fixture pools, such as Premiership and Championship.</p></div><form action={createDefaultDivisionsAction}><input type="hidden" name="leagueId" value={league.id} /><button type="submit" className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20">Add Premiership + Championship</button></form></div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{divisions.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60 md:col-span-2">No divisions yet. Add Premiership and Championship to split this league into two divisions.</div> : divisions.map((division) => <div key={division.id} className="rounded-2xl border border-white/10 bg-black/25 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-white">{division.name}</h3><p className="mt-1 text-xs text-white/45">/{division.slug}</p></div><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">{division.teamCount} team{division.teamCount === 1 ? "" : "s"}</span></div></div>)}</div>
            <form action={createLeagueDivisionAction} className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_1fr_120px_auto] md:items-end"><input type="hidden" name="leagueId" value={league.id} /><label className="space-y-2 text-sm text-white/60"><span>Division name</span><input name="name" placeholder="Premiership" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/50" /></label><label className="space-y-2 text-sm text-white/60"><span>Slug</span><input name="slug" placeholder="premiership" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/50" /></label><label className="space-y-2 text-sm text-white/60"><span>Order</span><input name="sortOrder" type="number" defaultValue={divisions.length + 1} className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white outline-none focus:border-emerald-400/50" /></label><button type="submit" className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400">Add division</button></form>
          </div>
        </div>
        <aside className="space-y-6"><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-lg font-semibold text-white">League summary</h2><div className="mt-4 space-y-3 text-sm text-white/60"><p><span className="font-semibold text-white/70">Season:</span> {league.season ?? "—"}</p><p><span className="font-semibold text-white/70">Night:</span> {formatDay(league.dayOfWeek ?? null)}</p><p><span className="font-semibold text-white/70">Type:</span> {formatLeagueType(league.leagueType ?? null)}</p><p><span className="font-semibold text-white/70">Team entries:</span> {getTeamEntryStatusLabel(teamEntryStatus)}</p><p><span className="font-semibold text-white/70">Player registrations:</span> {getPlayerEntryStatusLabel(playerEntryStatus)}</p><p><span className="font-semibold text-white/70">Start:</span> {formatDisplayDate(settings.proposedStartDate)}</p><p><span className="font-semibold text-white/70">Team fee:</span> {formatCurrency(settings.costPerTeamPerMatchPence)}</p><p><span className="font-semibold text-white/70">Pitches booked:</span> {settings.bookedPitchCount ?? "—"}</p><p><span className="font-semibold text-white/70">Booking:</span> {settings.bookingStartTime && settings.bookingEndTime ? `${settings.bookingStartTime}–${settings.bookingEndTime}` : "—"}</p><p><span className="font-semibold text-white/70">Pitch override:</span> {formatCurrency(settings.pitchCostPerHourOverridePence)}</p><p><span className="font-semibold text-white/70">Teams:</span> {league._count.teams}</p><p><span className="font-semibold text-white/70">Fixtures:</span> {league._count.fixtures}</p></div></div><div className="rounded-3xl border border-white/10 bg-white/5 p-6"><h2 className="text-lg font-semibold text-white">Teams</h2><div className="mt-4 space-y-3">{league.teams.map((team) => { const contact = contactMap.get(team.id); return <div key={team.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><div className="flex items-center gap-3"><TeamBadge name={team.name} logoUrl={team.logoUrl} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{team.name}</p><p className="truncate text-xs text-white/45">{contact?.primaryContact.email ?? "No contact email"}</p></div></div></div>; })}</div></div></aside>
      </div>
    </div>
  );
}
