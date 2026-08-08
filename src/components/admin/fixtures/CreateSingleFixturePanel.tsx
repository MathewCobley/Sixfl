"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { createSingleDraftFixtureAction } from "@/app/(admin)/admin/fixtures/generate/single-fixture-action";

type LeagueOption = {
  id: string;
  label: string;
};

type DivisionOption = {
  id: string;
  leagueId: string;
  name: string;
};

type TeamOption = {
  id: string;
  name: string;
  leagueId: string;
  divisionId: string | null;
};

type VenueOption = {
  id: string;
  name: string;
};

type RefereeOption = {
  id: string;
  label: string;
};

const inputClass =
  "h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";
const labelClass =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45";

export default function CreateSingleFixturePanel({
  leagues,
  divisions,
  teams,
  venues,
  referees,
}: {
  leagues: LeagueOption[];
  divisions: DivisionOption[];
  teams: TeamOption[];
  venues: VenueOption[];
  referees: RefereeOption[];
}) {
  const searchParams = useSearchParams();
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const [divisionId, setDivisionId] = useState("");
  const created = searchParams.get("singleCreated") === "1";
  const createdFixtureId = searchParams.get("singleFixtureId")?.trim() ?? "";
  const createError = searchParams.get("singleError")?.trim() ?? "";

  const leagueDivisions = useMemo(
    () => divisions.filter((division) => division.leagueId === leagueId),
    [divisions, leagueId],
  );

  const availableTeams = useMemo(
    () =>
      teams.filter(
        (team) =>
          team.leagueId === leagueId &&
          (!divisionId || team.divisionId === divisionId),
      ),
    [teams, leagueId, divisionId],
  );

  function changeLeague(nextLeagueId: string) {
    setLeagueId(nextLeagueId);
    setDivisionId("");
  }

  return (
    <form action={createSingleDraftFixtureAction} className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300/80">
          One-off match
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Create one fixture</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
          Add one specific fixture without generating the rest of the week or rebuilding the schedule.
          It is created as an unpublished draft so you can check it before publishing.
        </p>
      </div>

      {created ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <span>Fixture created successfully as a draft.</span>
          {createdFixtureId ? (
            <Link
              href={`/admin/fixtures/${encodeURIComponent(createdFixtureId)}/edit`}
              className="font-semibold underline decoration-emerald-200/40 underline-offset-4 hover:text-white"
            >
              Open fixture
            </Link>
          ) : null}
        </div>
      ) : null}

      {createError ? (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {createError}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className={labelClass}>League / current season</label>
          <select
            name="leagueId"
            value={leagueId}
            onChange={(event) => changeLeague(event.target.value)}
            required
            className={inputClass}
          >
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Division</label>
          <select
            name="divisionId"
            value={divisionId}
            onChange={(event) => setDivisionId(event.target.value)}
            className={inputClass}
          >
            <option value="">No division / infer from teams</option>
            {leagueDivisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Venue</label>
          <select name="venueId" className={inputClass}>
            <option value="">No venue yet</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Team 1</label>
          <select name="homeTeamId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Choose team 1
            </option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Team 2</label>
          <select name="awayTeamId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Choose team 2
            </option>
            {availableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Referee</label>
          <select name="refereeId" className={inputClass}>
            <option value="">No referee yet</option>
            {referees.map((referee) => (
              <option key={referee.id} value={referee.id}>
                {referee.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Fixture date</label>
          <input type="date" name="fixtureDate" required className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Kick-off</label>
          <input type="time" name="fixtureTime" required className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Pitch</label>
          <input type="text" name="pitch" placeholder="e.g. Pitch 2" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Week</label>
          <input type="number" name="round" min={1} placeholder="e.g. 5" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Game position</label>
          <input type="number" name="position" min={1} placeholder="e.g. 4" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>Status</label>
          <select name="status" defaultValue="SCHEDULED" className={inputClass}>
            <option value="SCHEDULED">Scheduled</option>
            <option value="POSTPONED">Postponed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {leagueId && availableTeams.length < 2 ? (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          This selection has fewer than two active teams in the current season. Check the league/division membership first.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
        <button
          type="submit"
          disabled={!leagueId || availableTeams.length < 2}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-sky-400 px-5 text-sm font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create draft fixture
        </button>
        <span className="text-xs text-white/45">
          No team emails are sent until the fixture is published.
        </span>
      </div>
    </form>
  );
}
