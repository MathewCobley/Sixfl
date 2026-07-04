// ========================================
// File: src/app/(admin)/admin/fixtures/[id]/edit/page.tsx
// ========================================

import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { FixtureStatus, NotificationDispatchStatus, Prisma } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import {
  parseLondonDateTime,
  toLondonDateInputValue,
  toLondonTimeInputValue,
} from "@/lib/datetime/london";
import { syncFixtureMatchFeeCharges } from "@/lib/payments/fixture-match-fees";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type TeamOption = {
  id: string;
  name: string;
};

const FIXTURE_CONFIRMATION_CHASE_SOURCE_TYPES = [
  "FIXTURE_CONFIRMATION_CHASE_SMS",
  "FIXTURE_CONFIRMATION_AUTO_SMS_72H",
  "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
] as const;

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatMoneyInputValue(amountPence: number | null) {
  if (amountPence === null || Number.isNaN(amountPence)) return "";
  return (amountPence / 100).toFixed(2);
}

function fixtureStatusOptions() {
  return [
    { value: FixtureStatus.SCHEDULED, label: "Scheduled" },
    { value: FixtureStatus.COMPLETED, label: "Completed" },
    { value: FixtureStatus.POSTPONED, label: "Postponed" },
    { value: FixtureStatus.CANCELLED, label: "Cancelled" },
  ];
}

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";
const labelClass =
  "mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45";

function parseRequiredString(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();
  if (!str) throw new Error(`${fieldName} is required.`);
  return str;
}

function parseOptionalString(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseOptionalInt(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const parsed = Number(str);
  if (!Number.isInteger(parsed)) throw new Error(`${fieldName} must be a whole number.`);
  return parsed;
}

function parseOptionalMoneyToPence(value: FormDataEntryValue | null, fieldName: string) {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const parsed = Number(str.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${fieldName} must be 0 or more.`);
  if (parsed === 0) return null;
  return Math.round(parsed * 100);
}

function parseFixtureStatus(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  if (Object.values(FixtureStatus).includes(str as FixtureStatus)) return str as FixtureStatus;
  return FixtureStatus.SCHEDULED;
}

function parseKickoffAt(formData: FormData) {
  const dateStr = parseRequiredString(formData.get("kickoffDate"), "Kickoff date");
  const timeStr = parseRequiredString(formData.get("kickoffTime"), "Kickoff time");
  return parseLondonDateTime(dateStr, timeStr);
}

async function getFixtureLeagueTeams(input: {
  leagueId: string;
  currentTeamIds: string[];
}) {
  const seasonTeams = await prisma.$queryRaw<TeamOption[]>(Prisma.sql`
    SELECT DISTINCT t."id", t."name"
    FROM "LeagueSeasonTeam" lst
    JOIN "Team" t ON t."id" = lst."teamId"
    WHERE lst."leagueId" = ${input.leagueId}
      AND lst."isActive" = true
    ORDER BY t."name" ASC
  `);

  const fallbackTeams = await prisma.team.findMany({
    where: {
      OR: [
        { leagueId: input.leagueId },
        { id: { in: input.currentTeamIds } },
      ],
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
  });

  const byId = new Map<string, TeamOption>();

  for (const team of seasonTeams) byId.set(team.id, team);
  for (const team of fallbackTeams) byId.set(team.id, team);

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function teamCanPlayInLeague(input: { teamId: string; leagueId: string }) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t."id"
    FROM "Team" t
    LEFT JOIN "LeagueSeasonTeam" lst
      ON lst."teamId" = t."id"
      AND lst."leagueId" = ${input.leagueId}
      AND lst."isActive" = true
    WHERE t."id" = ${input.teamId}
      AND (t."leagueId" = ${input.leagueId} OR lst."id" IS NOT NULL)
    LIMIT 1
  `);

  return Boolean(rows[0]);
}

async function cancelQueuedFixtureConfirmationChases(input: {
  fixtureId: string;
  reason: string;
}) {
  await prisma.notificationDispatch.updateMany({
    where: {
      sourceType: { in: [...FIXTURE_CONFIRMATION_CHASE_SOURCE_TYPES] },
      sourceId: { startsWith: `${input.fixtureId}:` },
      status: NotificationDispatchStatus.QUEUED,
    },
    data: {
      status: NotificationDispatchStatus.CANCELLED,
      cancelledAt: new Date(),
      failureReason: input.reason,
    },
  });
}

function shouldPauseFixtureAdminProcesses(status: FixtureStatus) {
  return status === FixtureStatus.POSTPONED || status === FixtureStatus.CANCELLED;
}

async function updateFixtureFromEditPageAction(formData: FormData) {
  "use server";

  await requireAdmin();

  const fixtureId = parseRequiredString(formData.get("fixtureId"), "Fixture ID");
  const returnTo = parseOptionalString(formData.get("returnTo")) ?? "/admin/fixtures";
  const leagueId = parseRequiredString(formData.get("leagueId"), "League");
  const homeTeamId = parseRequiredString(formData.get("homeTeamId"), "Team 1");
  const awayTeamId = parseRequiredString(formData.get("awayTeamId"), "Team 2");
  const venueId = parseOptionalString(formData.get("venueId"));
  const refereeId = parseOptionalString(formData.get("refereeId"));
  const kickoffAt = parseKickoffAt(formData);
  const round = parseOptionalInt(formData.get("round"), "Week");
  const position = parseOptionalInt(formData.get("position"), "Game position");
  const pitch = parseOptionalString(formData.get("pitch"));
  const status = parseFixtureStatus(formData.get("status"));
  const homeMatchFeePence = parseOptionalMoneyToPence(formData.get("homeMatchFeePounds"), "Team 1 fee");
  const awayMatchFeePence = parseOptionalMoneyToPence(formData.get("awayMatchFeePounds"), "Team 2 fee");
  const fixtureMatchFeePence = Math.max(homeMatchFeePence ?? 0, awayMatchFeePence ?? 0) || null;

  if (homeTeamId === awayTeamId) {
    throw new Error("Team 1 and Team 2 cannot be the same team.");
  }

  const [fixture, league, homeTeam, awayTeam, venue, referee, homeAllowed, awayAllowed] = await Promise.all([
    prisma.fixture.findUnique({
      where: { id: fixtureId },
      select: {
        id: true,
        leagueId: true,
        league: { select: { slug: true } },
      },
    }),
    prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, season: true, slug: true },
    }),
    prisma.team.findUnique({
      where: { id: homeTeamId },
      select: { id: true, name: true, leagueId: true, logoUrl: true },
    }),
    prisma.team.findUnique({
      where: { id: awayTeamId },
      select: { id: true, name: true, leagueId: true, logoUrl: true },
    }),
    venueId ? prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } }) : Promise.resolve(null),
    refereeId ? prisma.user.findUnique({ where: { id: refereeId }, select: { id: true, role: true } }) : Promise.resolve(null),
    teamCanPlayInLeague({ teamId: homeTeamId, leagueId }),
    teamCanPlayInLeague({ teamId: awayTeamId, leagueId }),
  ]);

  if (!fixture) throw new Error("Fixture not found.");
  if (!league) throw new Error("Selected league was not found.");
  if (!homeTeam) throw new Error("Selected Team 1 was not found.");
  if (!awayTeam) throw new Error("Selected Team 2 was not found.");
  if (!homeAllowed) throw new Error("Team 1 is not attached to this league season.");
  if (!awayAllowed) throw new Error("Team 2 is not attached to this league season.");
  if (venueId && !venue) throw new Error("Selected venue was not found.");
  if (refereeId && (!referee || referee.role !== "REFEREE")) throw new Error("Selected referee was not found.");

  await prisma.$transaction(async (tx) => {
    await tx.fixture.update({
      where: { id: fixtureId },
      data: {
        leagueId,
        homeTeamId,
        awayTeamId,
        venueId,
        refereeId,
        kickoffAt,
        round,
        position,
        pitch,
        status,
        matchFeePence: fixtureMatchFeePence,
      },
    });

    await syncFixtureMatchFeeCharges({
      db: tx,
      fixtureId,
      leagueId,
      leagueName: league.name,
      leagueSeason: league.season,
      kickoffAt,
      homeTeam,
      awayTeam,
      homeMatchFeePence,
      awayMatchFeePence,
    });
  });

  if (shouldPauseFixtureAdminProcesses(status)) {
    await cancelQueuedFixtureConfirmationChases({
      fixtureId,
      reason:
        status === FixtureStatus.POSTPONED
          ? "Fixture was postponed before queued confirmation SMS was sent."
          : "Fixture was cancelled before queued confirmation SMS was sent.",
    });
  }

  revalidatePath("/admin/fixtures");
  revalidatePath(returnTo);
  revalidatePath(`/admin/leagues/${leagueId}/fixtures`);
  revalidatePath(`/admin/leagues/${leagueId}`);

  if (league.slug) {
    revalidatePath(`/leagues/${league.slug}`);
    revalidatePath(`/leagues/${league.slug}/fixtures`);
  }

  if (fixture.league.slug && fixture.league.slug !== league.slug) {
    revalidatePath(`/leagues/${fixture.league.slug}`);
    revalidatePath(`/leagues/${fixture.league.slug}/fixtures`);
  }

  redirect(returnTo);
}

export default async function EditFixturePage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const returnTo = getSearchParamValue(sp.returnTo) || "/admin/fixtures";

  const fixture = await prisma.fixture.findUnique({
    where: { id },
    include: {
      league: { select: { id: true, name: true, season: true } },
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      venue: { select: { id: true, name: true } },
      referee: { select: { id: true, name: true, email: true } },
      paymentCharges: {
        where: { status: { not: "VOID" } },
        select: { teamId: true, amountPence: true, status: true },
      },
    },
  });

  if (!fixture) notFound();

  const [leagues, leagueTeams, venues, referees] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: { id: true, name: true, season: true },
    }),
    getFixtureLeagueTeams({
      leagueId: fixture.leagueId,
      currentTeamIds: [fixture.homeTeamId, fixture.awayTeamId],
    }),
    prisma.venue.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { role: "REFEREE" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const activeCharges = fixture.paymentCharges.filter((charge) => charge.status !== "VOID");
  const homeCharge = activeCharges.find((charge) => charge.teamId === fixture.homeTeamId);
  const awayCharge = activeCharges.find((charge) => charge.teamId === fixture.awayTeamId);
  const homeMatchFeePence = homeCharge?.amountPence ?? fixture.matchFeePence ?? null;
  const awayMatchFeePence = awayCharge?.amountPence ?? fixture.matchFeePence ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link href={returnTo} className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
          ← Back to selected fixtures
        </Link>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
          Edit fixture
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          {fixture.homeTeam.name} vs {fixture.awayTeam.name}
        </h1>
        <p className="mt-3 text-sm text-white/55">
          {fixture.league.name}{fixture.league.season ? ` · ${fixture.league.season}` : ""}
        </p>
      </div>

      <AdminCard className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <form action={updateFixtureFromEditPageAction} className="space-y-8">
          <input type="hidden" name="fixtureId" value={fixture.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>League</label>
              <select name="leagueId" defaultValue={fixture.leagueId} className={inputClass}>
                {leagues.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}{league.season ? ` · ${league.season}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-white/40">
                Team dropdowns use the selected season's LeagueSeasonTeam records, with the current fixture teams included as a fallback.
              </p>
            </div>

            <div>
              <label className={labelClass}>Team 1</label>
              <select name="homeTeamId" defaultValue={fixture.homeTeamId} className={inputClass}>
                {leagueTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Team 2</label>
              <select name="awayTeamId" defaultValue={fixture.awayTeamId} className={inputClass}>
                {leagueTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Kickoff date</label>
              <input
                type="date"
                name="kickoffDate"
                defaultValue={toLondonDateInputValue(fixture.kickoffAt)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Kickoff time</label>
              <input
                type="time"
                name="kickoffTime"
                defaultValue={toLondonTimeInputValue(fixture.kickoffAt)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Venue</label>
              <select name="venueId" defaultValue={fixture.venueId ?? ""} className={inputClass}>
                <option value="">No venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>{venue.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Referee</label>
              <select name="refereeId" defaultValue={fixture.refereeId ?? ""} className={inputClass}>
                <option value="">Unassigned</option>
                {referees.map((referee) => (
                  <option key={referee.id} value={referee.id}>
                    {referee.name || referee.email || "Unnamed referee"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Week</label>
              <input
                type="number"
                name="round"
                defaultValue={fixture.round ?? ""}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Game position</label>
              <input
                type="number"
                name="position"
                min={1}
                defaultValue={fixture.position ?? ""}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Pitch</label>
              <input
                type="text"
                name="pitch"
                defaultValue={fixture.pitch ?? ""}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Status</label>
              <select name="status" defaultValue={fixture.status} className={inputClass}>
                {fixtureStatusOptions().map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Team 1 fee (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="homeMatchFeePounds"
                defaultValue={formatMoneyInputValue(homeMatchFeePence)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Team 2 fee (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                name="awayMatchFeePounds"
                defaultValue={formatMoneyInputValue(awayMatchFeePence)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-6">
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              Save fixture changes
            </button>
            <Link
              href={returnTo}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-6 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.08]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </AdminCard>
    </div>
  );
}
