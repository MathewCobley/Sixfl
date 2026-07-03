// ========================================
// File: src/app/(admin)/admin/fixtures/[id]/edit/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { FixtureStatus } from "@prisma/client";

import AdminCard from "@/components/admin/AdminCard";
import { updateFixtureAction } from "@/app/(admin)/admin/fixtures/actions";
import {
  toLondonDateInputValue,
  toLondonTimeInputValue,
} from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

  const [leagues, teams, venues, referees] = await Promise.all([
    prisma.league.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { season: "asc" }],
      select: { id: true, name: true, season: true },
    }),
    prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, leagueId: true },
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

  const leagueTeams = teams.filter((team) => team.leagueId === fixture.leagueId);
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
        <form action={updateFixtureAction} className="space-y-8">
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
                Team dropdowns below show teams from the fixture's current league. Move teams carefully if changing the league.
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
