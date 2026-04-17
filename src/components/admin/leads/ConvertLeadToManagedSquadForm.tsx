// ========================================
// File: src/components/admin/leads/ConvertLeadToManagedSquadForm.tsx
// ========================================

"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";
import { convertLeadToManagedSquadPlayerAction } from "@/app/(admin)/admin/leads/convert-actions";

type ManagedTeamOption = {
  value: string;
  label: string;
};

type Props = {
  leadId: string;
  teams: ManagedTeamOption[];
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function ConvertLeadToManagedSquadForm({
  leadId,
  teams,
}: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.value ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTeam = useMemo(
    () => teams.find((team) => team.value === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );

  function handleSubmit() {
    if (!selectedTeamId) {
      setError("Please select a managed squad.");
      return;
    }

    setError(null);

    const formData = new FormData();
    formData.append("leadId", leadId);
    formData.append("teamId", selectedTeamId);
    formData.append("notes", notes);

    startTransition(async () => {
      try {
        await convertLeadToManagedSquadPlayerAction(formData);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to add this lead to the managed squad.",
        );
      }
    });
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/85">
        No managed squads are available yet. Set a team to <strong>Managed</strong>
        {" "}first, then come back and add this player lead into that squad.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm text-white/70">Managed squad</label>

          <Listbox value={selectedTeamId} onChange={setSelectedTeamId}>
            <div className="relative">
              <Listbox.Button className="relative flex h-12 w-full items-center justify-between rounded-xl border border-white/10 bg-[#0d1428] px-4 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20">
                <span
                  className={cx(
                    "block truncate",
                    selectedTeam ? "text-white" : "text-white/45",
                  )}
                >
                  {selectedTeam ? selectedTeam.label : "Select managed squad"}
                </span>

                <ChevronUpDownIcon
                  className="ml-3 h-5 w-5 shrink-0 text-white/50"
                  aria-hidden="true"
                />
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
                          <span
                            className={cx(
                              "block truncate",
                              selected ? "font-medium text-emerald-300" : "",
                            )}
                          >
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

        <div className="space-y-2">
          <label
            htmlFor="managed-squad-notes"
            className="block text-sm text-white/70"
          >
            Squad notes
          </label>
          <textarea
            id="managed-squad-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            placeholder="Optional notes for the manager, e.g. can cover defence and midfield, only available on Tuesdays, wants to join from next month."
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
          />
          <p className="text-xs text-white/45">
            The original lead message, area, league type, and preferred nights
            will also be copied into the prospect notes automatically.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Adding to squad..." : "Add to managed squad"}
          </button>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
