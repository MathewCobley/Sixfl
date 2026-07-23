"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import AdminComboboxField from "@/components/admin/forms/AdminComboboxField";
import FormListboxField from "@/components/ui/FormListboxField";
import { updateFixtureFromEditPageAction } from "@/app/(admin)/admin/fixtures/[id]/edit/actions";

type LeagueOption = { id: string; name: string; season: string | null };
type TeamOption = { id: string; name: string; leagueIds: string[] };
type VenueOption = { id: string; name: string };
type RefereeOption = { id: string; name: string | null; email: string | null };

type FixtureValues = {
  id: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  venueId: string | null;
  refereeId: string | null;
  kickoffDate: string;
  kickoffTime: string;
  round: number | null;
  position: number | null;
  pitch: string | null;
  status: string;
  homeMatchFeePounds: string;
  awayMatchFeePounds: string;
};

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20";
const labelClass =
  "mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/45";

export default function FixtureEditForm({
  fixture,
  returnTo,
  leagues,
  teams,
  venues,
  referees,
}: {
  fixture: FixtureValues;
  returnTo: string;
  leagues: LeagueOption[];
  teams: TeamOption[];
  venues: VenueOption[];
  referees: RefereeOption[];
}) {
  const [leagueId, setLeagueId] = useState(fixture.leagueId);

  const leagueOptions = useMemo(
    () =>
      leagues.map((league) => ({
        value: league.id,
        label: league.season ? `${league.name} · ${league.season}` : league.name,
      })),
    [leagues],
  );

  const teamOptions = useMemo(() => {
    const currentIds = new Set([fixture.homeTeamId, fixture.awayTeamId]);
    return teams
      .filter((team) => team.leagueIds.includes(leagueId) || currentIds.has(team.id))
      .map((team) => ({ id: team.id, label: team.name }));
  }, [fixture.awayTeamId, fixture.homeTeamId, leagueId, teams]);

  const venueOptions = useMemo(
    () => venues.map((venue) => ({ id: venue.id, label: venue.name })),
    [venues],
  );
  const refereeOptions = useMemo(
    () =>
      referees.map((referee) => ({
        id: referee.id,
        label: referee.name || referee.email || "Unnamed referee",
        description: referee.name && referee.email ? referee.email : null,
      })),
    [referees],
  );

  return (
    <form action={updateFixtureFromEditPageAction} className="space-y-8">
      <input type="hidden" name="fixtureId" value={fixture.id} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <FormListboxField
            name="leagueId"
            label="League"
            value={leagueId}
            options={leagueOptions}
            placeholder="Select league"
            onValueChange={setLeagueId}
          />
          <p className="mt-2 text-xs text-white/40">
            Team choices follow the selected competition season. The fixture’s current teams remain available as a safe fallback.
          </p>
        </div>

        <AdminComboboxField
          key={`home-${leagueId}`}
          name="homeTeamId"
          label="Team 1"
          defaultValue={fixture.homeTeamId}
          placeholder="Search Team 1"
          options={teamOptions}
          required
        />
        <AdminComboboxField
          key={`away-${leagueId}`}
          name="awayTeamId"
          label="Team 2"
          defaultValue={fixture.awayTeamId}
          placeholder="Search Team 2"
          options={teamOptions}
          required
        />

        <div>
          <label className={labelClass}>Kick-off date</label>
          <input
            type="date"
            name="kickoffDate"
            required
            defaultValue={fixture.kickoffDate}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Kick-off time</label>
          <input
            type="time"
            name="kickoffTime"
            required
            defaultValue={fixture.kickoffTime}
            className={inputClass}
          />
        </div>

        <AdminComboboxField
          name="venueId"
          label="Venue"
          defaultValue={fixture.venueId ?? ""}
          placeholder="Select venue"
          options={venueOptions}
        />
        <AdminComboboxField
          name="refereeId"
          label="Referee"
          defaultValue={fixture.refereeId ?? ""}
          placeholder="Select referee"
          options={refereeOptions}
        />

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
        <FormListboxField
          name="status"
          label="Status"
          value={fixture.status}
          options={[
            { value: "SCHEDULED", label: "Scheduled" },
            { value: "COMPLETED", label: "Completed" },
            { value: "POSTPONED", label: "Postponed" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />

        <div>
          <label className={labelClass}>Team 1 fee (£)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="homeMatchFeePounds"
            defaultValue={fixture.homeMatchFeePounds}
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
            defaultValue={fixture.awayMatchFeePounds}
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
  );
}
