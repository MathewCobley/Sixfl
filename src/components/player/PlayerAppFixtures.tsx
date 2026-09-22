import Link from "next/link";
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

import PlayerFixtureTeams from "@/components/player/PlayerFixtureTeams";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  joinPlayerFixtureWaitlistAction,
  leavePlayerFixtureWaitlistAction,
  requestPlayerWithdrawalAction,
  updatePlayerFixtureAvailabilityAction,
} from "@/app/player/team/[teamid]/availability/actions";

type AppTeam = {
  name: string;
  logoUrl: string | null;
};

export type PlayerAppFixtureItem = {
  id: string;
  kickoffAt: Date;
  round: number | null;
  pitch: string | null;
  venueName: string | null;
  status: "SCHEDULED" | "POSTPONED";
  homeTeam: AppTeam;
  awayTeam: AppTeam;
  availabilityResponse: string | null;
  availabilityNote: string | null;
  selected: boolean;
  squadPicked: boolean;
};

export type PlayerAppCancelledFixtureItem = {
  id: string;
  kickoffAt: Date;
  round: number | null;
  pitch: string | null;
  venueName: string | null;
  homeTeam: AppTeam;
  awayTeam: AppTeam;
};

export type PlayerAppRecentResult = {
  id: string;
  kickoffAt: Date;
  homeTeam: AppTeam;
  awayTeam: AppTeam;
  homeScore: number;
  awayScore: number;
};

function fixtureHref(
  teamId: string,
  fixtureId: string,
  previewMembershipId: string | null,
) {
  const params = new URLSearchParams({ fixtureId });
  if (previewMembershipId) {
    params.set("previewMembershipId", previewMembershipId);
  }
  return `/player/team/${teamId}/availability?${params.toString()}`;
}

function responseLabel(response: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Can't play";
    default:
      return "Respond";
  }
}

function responseClasses(response: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
    case "MAYBE":
      return "border-amber-300/30 bg-amber-400/15 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/30 bg-red-500/15 text-red-100";
    default:
      return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  }
}

function selectionLabel(fixture: PlayerAppFixtureItem) {
  if (fixture.selected) return "Selected";
  if (fixture.squadPicked) return "Not in squad";
  return "Not selected yet";
}

function selectionClasses(fixture: PlayerAppFixtureItem) {
  if (fixture.selected) {
    return "border-emerald-400/30 bg-emerald-500/15 text-emerald-100";
  }
  if (fixture.squadPicked) {
    return "border-red-400/25 bg-red-500/10 text-red-100";
  }
  return "border-white/10 bg-white/[0.04] text-white/55";
}

function dateLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeLabel(value: Date) {
  return formatDateTimeInLondon(value, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resultDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "numeric",
    month: "short",
  });
}

function venueLabel(fixture: {
  venueName: string | null;
  pitch: string | null;
}) {
  return [fixture.venueName, fixture.pitch].filter(Boolean).join(" · ") || "Venue TBC";
}

function HiddenFields({
  teamId,
  fixtureId,
  previewMembershipId,
}: {
  teamId: string;
  fixtureId: string;
  previewMembershipId: string | null;
}) {
  return (
    <>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="fixtureId" value={fixtureId} />
      {previewMembershipId ? (
        <input
          type="hidden"
          name="previewMembershipId"
          value={previewMembershipId}
        />
      ) : null}
    </>
  );
}

function StatusPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${className}`}
    >
      {children}
    </span>
  );
}

export default function PlayerAppFixtures({
  teamId,
  selectedFixture,
  fixtures,
  cancelledFixtures,
  recentResults,
  previewMembershipId,
  savedMessage,
  withdrawalRequest,
  waitlistRequest,
}: {
  teamId: string;
  selectedFixture: PlayerAppFixtureItem | null;
  fixtures: PlayerAppFixtureItem[];
  cancelledFixtures: PlayerAppCancelledFixtureItem[];
  recentResults: PlayerAppRecentResult[];
  previewMembershipId: string | null;
  savedMessage: string | null;
  withdrawalRequest: { reason: string | null } | null;
  waitlistRequest: { reason: string | null } | null;
}) {
  const selectedIndex = selectedFixture
    ? fixtures.findIndex((fixture) => fixture.id === selectedFixture.id)
    : -1;
  const selectedIsNext = selectedIndex <= 0;

  return (
    <section className="px-3 pb-24 pt-3 text-white">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300/75">
            Fixtures
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">
            {selectedIsNext ? "Next match" : "Fixture details"}
          </h1>
          <p className="mt-1 text-xs text-white/45">
            Your match, availability and selection status in one place.
          </p>
        </div>

        {savedMessage ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {savedMessage}
          </div>
        ) : null}

        {selectedFixture ? (
          <section className="overflow-hidden rounded-[1.5rem] border border-sky-400/30 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_42%),linear-gradient(145deg,#0a1c27,#08140f)] shadow-[0_16px_48px_rgba(0,0,0,0.3)]">
            <div className="px-4 pb-4 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-300/75">
                    {selectedIsNext ? "Next match" : "Selected fixture"}
                    {selectedFixture.round ? ` · Matchweek ${selectedFixture.round}` : ""}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-white/85">
                    <ClockIcon className="h-4 w-4 text-sky-300" aria-hidden="true" />
                    {dateLabel(selectedFixture.kickoffAt)} · {timeLabel(selectedFixture.kickoffAt)}
                  </div>
                </div>
                {selectedFixture.status === "POSTPONED" ? (
                  <StatusPill className="border-amber-300/30 bg-amber-400/15 text-amber-100">
                    Postponed
                  </StatusPill>
                ) : null}
              </div>

              <div className="mt-5">
                <PlayerFixtureTeams
                  homeTeam={selectedFixture.homeTeam}
                  awayTeam={selectedFixture.awayTeam}
                />
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
                <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
                <div className="text-xs leading-5 text-white/60">
                  <div className="font-semibold text-white/80">
                    {venueLabel(selectedFixture)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill className={responseClasses(selectedFixture.availabilityResponse)}>
                  {responseLabel(selectedFixture.availabilityResponse)}
                </StatusPill>
                <StatusPill className={selectionClasses(selectedFixture)}>
                  {selectionLabel(selectedFixture)}
                </StatusPill>
              </div>
            </div>

            <div className="border-t border-white/[0.07] bg-black/15 px-4 py-4">
              {selectedFixture.selected ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-black text-white">You're selected</div>
                      <p className="mt-1 text-xs leading-5 text-emerald-100/70">
                        Your place is in the saved matchday squad. Availability is now locked.
                      </p>
                    </div>
                  </div>

                  {withdrawalRequest ? (
                    <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-xs leading-5 text-red-100/80">
                      <div className="font-black text-white">Withdrawal request sent</div>
                      <p className="mt-1">
                        Your captain has been told. You remain selected until they update the squad.
                      </p>
                      {withdrawalRequest.reason ? (
                        <p className="mt-2 text-red-50/70">Reason: {withdrawalRequest.reason}</p>
                      ) : null}
                    </div>
                  ) : (
                    <form action={requestPlayerWithdrawalAction}>
                      <HiddenFields
                        teamId={teamId}
                        fixtureId={selectedFixture.id}
                        previewMembershipId={previewMembershipId}
                      />
                      <label htmlFor="pwa-withdrawal-reason" className="text-xs font-bold text-white/70">
                        Can no longer play?
                      </label>
                      <textarea
                        id="pwa-withdrawal-reason"
                        name="reason"
                        rows={2}
                        required
                        minLength={5}
                        placeholder="Briefly tell your captain why"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-red-400"
                      />
                      <button
                        type="submit"
                        className="mt-2 inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-xs font-bold text-red-100"
                      >
                        Send withdrawal request
                      </button>
                    </form>
                  )}
                </div>
              ) : selectedFixture.squadPicked ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 p-3">
                    <UserGroupIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
                    <div>
                      <div className="text-sm font-black text-white">Squad has been picked</div>
                      <p className="mt-1 text-xs leading-5 text-amber-100/70">
                        You're not currently in the matchday squad. If you're free, you can join the waiting list.
                      </p>
                    </div>
                  </div>

                  {waitlistRequest ? (
                    <form action={leavePlayerFixtureWaitlistAction} className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3">
                      <HiddenFields
                        teamId={teamId}
                        fixtureId={selectedFixture.id}
                        previewMembershipId={previewMembershipId}
                      />
                      <div className="text-sm font-black text-white">You're on the waiting list</div>
                      <p className="mt-1 text-xs leading-5 text-sky-100/70">
                        Your captain knows you can play if a place opens.
                      </p>
                      <button
                        type="submit"
                        className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white/70"
                      >
                        Leave waiting list
                      </button>
                    </form>
                  ) : (
                    <form action={joinPlayerFixtureWaitlistAction}>
                      <HiddenFields
                        teamId={teamId}
                        fixtureId={selectedFixture.id}
                        previewMembershipId={previewMembershipId}
                      />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-sky-400 px-4 py-3 text-sm font-black text-[#06110e]"
                      >
                        Join waiting list
                      </button>
                    </form>
                  )}

                  <form action={updatePlayerFixtureAvailabilityAction} className="grid grid-cols-2 gap-2">
                    <HiddenFields
                      teamId={teamId}
                      fixtureId={selectedFixture.id}
                      previewMembershipId={previewMembershipId}
                    />
                    <input type="hidden" name="note" value={selectedFixture.availabilityNote ?? ""} />
                    <button
                      type="submit"
                      name="response"
                      value="MAYBE"
                      className={`rounded-xl border px-3 py-2.5 text-xs font-black ${
                        selectedFixture.availabilityResponse === "MAYBE"
                          ? "border-amber-300/40 bg-amber-400/15 text-amber-100"
                          : "border-white/10 bg-white/[0.04] text-white/60"
                      }`}
                    >
                      Maybe
                    </button>
                    <button
                      type="submit"
                      name="response"
                      value="UNAVAILABLE"
                      className={`rounded-xl border px-3 py-2.5 text-xs font-black ${
                        selectedFixture.availabilityResponse === "UNAVAILABLE"
                          ? "border-red-400/40 bg-red-500/15 text-red-100"
                          : "border-white/10 bg-white/[0.04] text-white/60"
                      }`}
                    >
                      Can't play
                    </button>
                  </form>
                </div>
              ) : (
                <form action={updatePlayerFixtureAvailabilityAction}>
                  <HiddenFields
                    teamId={teamId}
                    fixtureId={selectedFixture.id}
                    previewMembershipId={previewMembershipId}
                  />
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-white/45">
                    Can you play?
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      ["AVAILABLE", "Yes", "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"],
                      ["MAYBE", "Maybe", "border-amber-300/35 bg-amber-400/15 text-amber-100"],
                      ["UNAVAILABLE", "No", "border-red-400/35 bg-red-500/15 text-red-100"],
                    ].map(([value, label, activeClasses]) => (
                      <button
                        key={value}
                        type="submit"
                        name="response"
                        value={value}
                        className={`rounded-xl border px-2 py-3 text-sm font-black ${
                          selectedFixture.availabilityResponse === value
                            ? activeClasses
                            : "border-white/10 bg-white/[0.04] text-white/65"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="pwa-availability-note" className="mt-3 block text-[11px] font-semibold text-white/45">
                    Optional note
                  </label>
                  <textarea
                    id="pwa-availability-note"
                    name="note"
                    rows={2}
                    defaultValue={selectedFixture.availabilityNote ?? ""}
                    placeholder="e.g. I can arrive after 7pm"
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-sky-400"
                  />
                  <p className="mt-2 text-[10px] leading-4 text-white/35">
                    Tap Yes, Maybe or No to save your response.
                  </p>
                </form>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-5 text-center">
            <CalendarDaysIcon className="mx-auto h-7 w-7 text-white/35" aria-hidden="true" />
            <h2 className="mt-3 text-base font-black text-white">No upcoming fixtures</h2>
            <p className="mt-1 text-xs leading-5 text-white/45">
              Your next published match will appear here.
            </p>
          </section>
        )}

        {cancelledFixtures.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2 px-1">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-300" aria-hidden="true" />
              <h2 className="text-xs font-black uppercase tracking-[0.14em] text-red-100/80">
                Fixture updates
              </h2>
            </div>
            <div className="space-y-2">
              {cancelledFixtures.map((fixture) => (
                <div
                  key={fixture.id}
                  className="rounded-2xl border border-red-400/25 bg-red-500/10 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <PlayerFixtureTeams
                        homeTeam={fixture.homeTeam}
                        awayTeam={fixture.awayTeam}
                        compact
                      />
                      <div className="mt-2 text-[11px] text-red-100/65">
                        {dateLabel(fixture.kickoffAt)} · {timeLabel(fixture.kickoffAt)}
                      </div>
                    </div>
                    <StatusPill className="border-red-400/30 bg-red-500/15 text-red-100">
                      Cancelled
                    </StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {fixtures.length > 1 ? (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/55">
                Upcoming fixtures
              </h2>
              <span className="text-[10px] text-white/30">{fixtures.length} published</span>
            </div>
            <div className="space-y-2">
              {fixtures.map((fixture) => (
                <Link
                  key={fixture.id}
                  href={fixtureHref(teamId, fixture.id, previewMembershipId)}
                  className={`block rounded-2xl border p-3 transition active:scale-[0.995] ${
                    selectedFixture?.id === fixture.id
                      ? "border-sky-400/35 bg-sky-500/10"
                      : "border-white/10 bg-white/[0.035]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <PlayerFixtureTeams
                        homeTeam={fixture.homeTeam}
                        awayTeam={fixture.awayTeam}
                        compact
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/45">
                        <span>{dateLabel(fixture.kickoffAt)} · {timeLabel(fixture.kickoffAt)}</span>
                        <span>·</span>
                        <span className="truncate">{venueLabel(fixture)}</span>
                      </div>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {fixture.status === "POSTPONED" ? (
                      <StatusPill className="border-amber-300/30 bg-amber-400/15 text-amber-100">
                        Postponed
                      </StatusPill>
                    ) : null}
                    <StatusPill className={responseClasses(fixture.availabilityResponse)}>
                      {responseLabel(fixture.availabilityResponse)}
                    </StatusPill>
                    <StatusPill className={selectionClasses(fixture)}>
                      {selectionLabel(fixture)}
                    </StatusPill>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {recentResults.length > 0 ? (
          <section id="recent-results" className="scroll-mt-24">
            <div className="mb-2 px-1">
              <h2 className="text-xs font-black uppercase tracking-[0.14em] text-white/55">
                Recent results
              </h2>
            </div>
            <div className="space-y-2">
              {recentResults.map((result) => (
                <article
                  key={result.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.035] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <PlayerFixtureTeams
                        homeTeam={result.homeTeam}
                        awayTeam={result.awayTeam}
                        compact
                      />
                      <div className="mt-2 text-[11px] text-white/40">
                        {resultDate(result.kickoffAt)}
                      </div>
                    </div>
                    <div className="shrink-0 text-xl font-black tabular-nums text-white">
                      {result.homeScore}–{result.awayScore}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
