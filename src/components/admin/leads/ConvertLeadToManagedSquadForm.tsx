// ========================================
// File: src/components/admin/leads/ConvertLeadToManagedSquadForm.tsx
// ========================================

"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { convertLeadToManagedSquadPlayerAction } from "@/app/(admin)/admin/leads/managed-squad-actions";
import { convertLeadToPlayerPoolAction } from "@/app/(admin)/admin/leads/player-pool-actions";
import { convertLeadToStandardSquadPlayerAction } from "@/app/(admin)/admin/leads/standard-squad-actions";

type TeamOption = {
  value: string;
  label: string;
};

type Props = {
  leadId: string;
  teams: TeamOption[];
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function SubmitButton({
  pendingLabel,
  label,
  variant = "primary",
}: {
  pendingLabel: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cx(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "secondary"
          ? "border border-white/10 bg-white/5 text-white hover:bg-white/10"
          : "bg-emerald-600 text-white hover:bg-emerald-500",
      )}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function TeamListbox({
  label,
  placeholder,
  teams,
  selectedTeamId,
  setSelectedTeamId,
}: {
  label: string;
  placeholder: string;
  teams: TeamOption[];
  selectedTeamId: string;
  setSelectedTeamId: (value: string) => void;
}) {
  const selectedTeam = useMemo(
    () => teams.find((team) => team.value === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  return (
    <div className="space-y-2">
      <label className="block text-sm text-white/70">{label}</label>

      <Listbox value={selectedTeamId} onChange={setSelectedTeamId}>
        <div className="relative">
          <Listbox.Button className="relative flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-[#0d1428] px-4 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20">
            <span className={cx("block truncate", selectedTeam ? "text-white" : "text-white/45")}>
              {selectedTeam ? selectedTeam.label : placeholder}
            </span>

            <ChevronUpDownIcon className="ml-3 h-5 w-5 shrink-0 text-white/50" aria-hidden="true" />
          </Listbox.Button>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Listbox.Options className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none">
              {teams.map((team) => (
                <Listbox.Option
                  key={team.value}
                  value={team.value}
                  className={({ active }) =>
                    cx(
                      "relative cursor-pointer select-none rounded-lg px-3 py-2.5 pr-10 text-sm transition",
                      active ? "bg-white/8 text-white" : "text-white/85",
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={cx("block truncate", selected ? "font-medium text-emerald-300" : "")}>
                        {team.label}
                      </span>

                      {selected ? (
                        <span className="absolute inset-y-0 right-3 flex items-center text-emerald-400">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

export default function ConvertLeadToManagedSquadForm({
  leadId,
  teams,
}: Props) {
  const [selectedManagedTeamId, setSelectedManagedTeamId] = useState(teams[0]?.value ?? "");
  const [selectedStandardTeamId, setSelectedStandardTeamId] = useState("");
  const [standardTeams, setStandardTeams] = useState<TeamOption[]>([]);
  const [standardTeamsLoaded, setStandardTeamsLoaded] = useState(false);
  const [notes, setNotes] = useState("");
  const [poolNotes, setPoolNotes] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStandardTeams() {
      try {
        const response = await fetch("/api/admin/teams/standard-options", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const payload = (await response.json().catch(() => null)) as { teams?: TeamOption[] } | null;
        const loadedTeams = payload?.teams ?? [];

        if (cancelled) return;

        setStandardTeams(loadedTeams);
        setSelectedStandardTeamId((current) => current || loadedTeams[0]?.value || "");
      } finally {
        if (!cancelled) {
          setStandardTeamsLoaded(true);
        }
      }
    }

    void loadStandardTeams();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Add to player pool</h3>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Keep this player available for any suitable SIXFL team without assigning them to a squad yet. Their lead details and preferred nights are copied into the pool record.
          </p>
        </div>

        <form action={convertLeadToPlayerPoolAction} className="space-y-4">
          <input type="hidden" name="leadId" value={leadId} />

          <div className="space-y-2">
            <label htmlFor="player-pool-notes" className="block text-sm text-white/70">
              Player pool notes
            </label>
            <textarea
              id="player-pool-notes"
              name="notes"
              value={poolNotes}
              onChange={(event) => setPoolNotes(event.target.value)}
              rows={3}
              placeholder="Optional note, e.g. best suited to Leeds Wednesday or happy to travel."
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-violet-400/60"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <SubmitButton pendingLabel="Adding to pool..." label="Add to player pool" variant="secondary" />
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Add to managed squad</h3>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Use this for organiser-managed teams where players are held as prospects before joining the matchday squad.
          </p>
        </div>

        {teams.length === 0 ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/85">
            No managed squads are available yet. Set a team to <strong>Managed</strong> first, then come back and add this player lead into that squad.
          </div>
        ) : (
          <form action={convertLeadToManagedSquadPlayerAction}>
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="teamId" value={selectedManagedTeamId} />

            <div className="space-y-4">
              <TeamListbox
                label="Managed squad"
                placeholder="Select managed squad"
                teams={teams}
                selectedTeamId={selectedManagedTeamId}
                setSelectedTeamId={setSelectedManagedTeamId}
              />

              <div className="space-y-2">
                <label htmlFor="managed-squad-notes" className="block text-sm text-white/70">
                  Squad notes
                </label>
                <textarea
                  id="managed-squad-notes"
                  name="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  placeholder="Optional notes for the manager, e.g. can cover defence and midfield, only available on Tuesdays, wants to join from next month."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
                />
                <p className="text-xs text-white/45">
                  The original lead message, area, league type, and preferred nights will also be copied into the prospect notes automatically.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <SubmitButton pendingLabel="Adding to squad..." label="Add to managed squad" />
              </div>
            </div>
          </form>
        )}
      </div>

      <div className="rounded-2xl border border-sky-400/20 bg-sky-500/5 p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-white">Add to standard squad</h3>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Use this when the player is joining an existing captain-led team. This creates or links the player account and adds them to the team roster.
          </p>
        </div>

        {!standardTeamsLoaded ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
            Loading standard squads...
          </div>
        ) : standardTeams.length === 0 ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/85">
            No standard squads are available yet.
          </div>
        ) : (
          <form action={convertLeadToStandardSquadPlayerAction} className="space-y-4">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="teamId" value={selectedStandardTeamId} />

            <TeamListbox
              label="Standard squad"
              placeholder="Select standard squad"
              teams={standardTeams}
              selectedTeamId={selectedStandardTeamId}
              setSelectedTeamId={setSelectedStandardTeamId}
            />

            <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/50">
              This requires an email address because standard squads use real player accounts.
            </div>

            <div className="flex flex-wrap gap-3">
              <SubmitButton pendingLabel="Adding player..." label="Add to standard squad" variant="secondary" />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
