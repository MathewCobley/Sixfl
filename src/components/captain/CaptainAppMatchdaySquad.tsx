import Link from "next/link";

import MatchdaySquadSelectionForm from "@/components/captain/MatchdaySquadSelectionForm";

type FixtureOption = {
  id: string;
  label: string;
  dateLabel: string;
  venueName: string | null;
  selected: boolean;
  isPast: boolean;
  selectedCount: number;
};

type PlayerOption = {
  id: string;
  value: string;
  name: string;
  secondary: string;
  availability: string | null;
  availabilityNote: string | null;
  selected: boolean;
  paidSelected: boolean;
  feeStatus: string | null;
  warning: string | null;
};

function availabilityLabel(response: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "Available";
    case "MAYBE":
      return "Maybe";
    case "UNAVAILABLE":
      return "Unavailable";
    default:
      return "No response";
  }
}

function availabilityClasses(response: string | null) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/45";
  }
}

function PlayerRow({ player }: { player: PlayerOption }) {
  return (
    <label
      className={
        "flex min-h-16 items-start gap-3 px-3.5 py-3 " +
        (player.availability === "UNAVAILABLE" ? "bg-red-500/[0.045]" : "")
      }
    >
      <input
        type="checkbox"
        name="player"
        value={player.value}
        defaultChecked={player.selected}
        data-paid-selected={player.paidSelected ? "true" : undefined}
        data-player-name={player.name}
        className="mt-1 h-5 w-5 shrink-0 accent-emerald-400"
      />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-white">{player.name}</span>
            <span className="mt-0.5 block text-[11px] text-white/35">{player.secondary}</span>
          </span>
          <span
            className={
              "shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold " +
              availabilityClasses(player.availability)
            }
          >
            {availabilityLabel(player.availability)}
          </span>
        </span>
        {player.paidSelected ? (
          <span className="mt-1.5 inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100">
            Paid
          </span>
        ) : player.feeStatus ? (
          <span className="mt-1.5 inline-flex rounded-full border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/45">
            {player.feeStatus}
          </span>
        ) : null}
        {player.availabilityNote ? (
          <span className="mt-1.5 block text-[11px] leading-4 text-white/40">
            {player.availabilityNote}
          </span>
        ) : null}
        {player.warning ? (
          <span className="mt-2 block rounded-xl border border-red-400/20 bg-red-500/10 px-2.5 py-2 text-[11px] leading-4 text-red-100">
            {player.warning}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function CaptainAppMatchdaySquad({
  teamId,
  teamName,
  managedTeam,
  selectedFixture,
  fixtures,
  members,
  prospects,
  selectedCount,
  availabilityCounts,
  savedMessage,
  errorMessage,
  action,
}: {
  teamId: string;
  teamName: string;
  managedTeam: boolean;
  selectedFixture: {
    id: string;
    label: string;
    dateLabel: string;
    venueName: string | null;
  } | null;
  fixtures: FixtureOption[];
  members: PlayerOption[];
  prospects: PlayerOption[];
  selectedCount: number;
  availabilityCounts: {
    available: number;
    maybe: number;
    unavailable: number;
    noResponse: number;
  };
  savedMessage: string | null;
  errorMessage: string | null;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <main className="mx-auto w-full max-w-xl space-y-3 pb-24 text-white">
      <header className="rounded-[1.2rem] border border-white/[0.07] bg-white/[0.035] p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300/70">
          Matchday
        </p>
        <h1 className="mt-1 text-xl font-black tracking-tight">Matchday squad</h1>
        {selectedFixture ? (
          <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] p-3">
            <div className="text-sm font-black leading-5 text-white">{selectedFixture.label}</div>
            <div className="mt-1 text-[11px] leading-4 text-white/45">
              {selectedFixture.dateLabel}
              {selectedFixture.venueName ? " · " + selectedFixture.venueName : ""}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-5 text-white/45">No editable fixture is available.</p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            href={"/captain/team/" + teamId + "/availability"}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 text-xs font-bold text-sky-100"
          >
            Availability
          </Link>
          <Link
            href={"/captain/team/" + teamId + "/captain-squad"}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-white/70"
          >
            Squad
          </Link>
        </div>
      </header>

      {!managedTeam ? (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
          Matchday player selection is intended for SIXFL-managed squads.
        </section>
      ) : null}

      {savedMessage ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-100">
          {savedMessage}
        </section>
      ) : null}
      {errorMessage ? (
        <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
          {errorMessage}
        </section>
      ) : null}

      {selectedFixture ? (
        <>
          <section className="grid grid-cols-4 gap-1.5" aria-label="Availability summary">
            {[
              ["Available", availabilityCounts.available, "text-emerald-200"],
              ["Maybe", availabilityCounts.maybe, "text-amber-200"],
              ["Out", availabilityCounts.unavailable, "text-red-200"],
              ["No reply", availabilityCounts.noResponse, "text-white/55"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-xl border border-white/[0.07] bg-black/15 px-2 py-2 text-center">
                <div className={"text-lg font-black tabular-nums " + tone}>{value}</div>
                <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-white/30">
                  {label}
                </div>
              </div>
            ))}
          </section>

          {fixtures.length > 1 ? (
            <details className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-bold text-white/75 [&::-webkit-details-marker]:hidden">
                <span>Change fixture</span>
                <span className="text-white/30 transition group-open:rotate-45">+</span>
              </summary>
              <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                {fixtures.map((fixture) => (
                  <Link
                    key={fixture.id}
                    href={"/captain/team/" + teamId + "/match-fees?fixtureId=" + fixture.id}
                    className={
                      "block px-3.5 py-3 " +
                      (fixture.selected ? "bg-emerald-500/[0.08]" : "active:bg-white/[0.05]")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-xs font-bold leading-5 text-white/80">
                          {fixture.label}
                        </span>
                        <span className="block text-[10px] leading-4 text-white/35">
                          {fixture.dateLabel}
                          {fixture.venueName ? " · " + fixture.venueName : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-white/35">
                        {fixture.selectedCount > 0
                          ? fixture.selectedCount + " selected"
                          : fixture.isPast
                            ? "Past"
                            : ""}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}

          <MatchdaySquadSelectionForm action={action} className="space-y-3">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="fixtureId" value={selectedFixture.id} />
            <input type="hidden" name="amount" value="6.00" />

            <section className="overflow-hidden rounded-[1.2rem] border border-white/[0.07] bg-white/[0.035]">
              <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-3">
                <div>
                  <h2 className="text-sm font-black">Who played?</h2>
                  <p className="mt-0.5 text-[10px] text-white/35">Tick the players who actually took part.</p>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-100">
                  {selectedCount} selected
                </span>
              </div>

              <div className="divide-y divide-white/[0.06]">
                {members.length ? members.map((player) => <PlayerRow key={player.id} player={player} />) : (
                  <div className="p-4 text-sm text-white/45">No linked squad players yet.</div>
                )}
              </div>
            </section>

            {prospects.length ? (
              <details className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3.5 text-sm font-bold text-white/75 [&::-webkit-details-marker]:hidden">
                  <span>Extra / unlinked players ({prospects.length})</span>
                  <span className="text-white/30 transition group-open:rotate-45">+</span>
                </summary>
                <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                  {prospects.map((player) => <PlayerRow key={player.id} player={player} />)}
                </div>
              </details>
            ) : null}

            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 text-sm font-black text-black active:bg-emerald-300"
            >
              Save matchday squad
            </button>

            <p className="px-2 text-center text-[10px] leading-4 text-white/30">
              Availability must be resolved before a player can be selected.
            </p>
          </MatchdaySquadSelectionForm>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-5 text-center text-sm text-white/45">
          No editable published fixtures are available for {teamName}.
        </section>
      )}
    </main>
  );
}
