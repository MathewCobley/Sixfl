// ========================================
// File: src/components/referee/DisciplinaryNoteForm.tsx
// ========================================

"use client";

import { Fragment, useState } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";

import { recordFixtureDisciplinaryNoteAction } from "@/app/(public)/referee/actions";

type Option = {
  value: string;
  label: string;
  helper?: string;
};

type TeamOption = {
  id: string;
  name: string;
};

type Props = {
  refereeNightId: string;
  fixtureId: string;
  teams: TeamOption[];
};

const INCIDENT_OPTIONS: Option[] = [
  { value: "DISSENT", label: "Dissent", helper: "Arguing, abuse or refusal to accept decisions." },
  { value: "FIGHTING", label: "Fighting / violent conduct", helper: "Physical confrontation or attempted violence." },
  { value: "AGGRESSIVE_CONDUCT", label: "Aggressive conduct", helper: "Threatening body language, squaring up or intimidation." },
  { value: "OFFENSIVE_LANGUAGE", label: "Offensive language", helper: "Abusive, discriminatory or offensive comments." },
  { value: "THREATENING_BEHAVIOUR", label: "Threatening behaviour", helper: "Threats towards referee, players or staff." },
  { value: "OTHER", label: "Other", helper: "Anything else SIXFL should review." },
];

const SEVERITY_OPTIONS: Option[] = [
  { value: "NOTE", label: "Note" },
  { value: "WARNING", label: "Warning" },
  { value: "SERIOUS", label: "Serious" },
  { value: "URGENT", label: "Urgent" },
];

function CustomSelect({
  name,
  value,
  options,
  onChange,
  label,
}: {
  name: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  label: string;
}) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">{label}</label>
      <input type="hidden" name={name} value={value} />

      <Listbox value={value} onChange={onChange}>
        <div className="relative z-50">
          <Listbox.Button className="flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/15">
            <span className="truncate">{selected.label}</span>
            <ChevronUpDownIcon className="ml-3 h-5 w-5 shrink-0 text-white/45" aria-hidden="true" />
          </Listbox.Button>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
          >
            <Listbox.Options className="absolute z-[100] mt-2 max-h-72 w-full overflow-auto rounded-xl border border-white/10 bg-zinc-950 p-1 shadow-2xl ring-1 ring-black/40 focus:outline-none">
              {options.map((option) => (
                <Listbox.Option
                  key={option.value}
                  value={option.value}
                  className={({ active }) =>
                    [
                      "relative cursor-pointer select-none rounded-lg px-3 py-2.5 pr-10 text-sm transition",
                      active ? "bg-white/8 text-white" : "text-white/85",
                    ].join(" ")
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={["block truncate", selected ? "font-medium text-emerald-300" : ""].join(" ")}>{option.label}</span>
                      {option.helper ? <span className="mt-1 block text-xs leading-5 text-white/45">{option.helper}</span> : null}
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

export default function DisciplinaryNoteForm({
  refereeNightId,
  fixtureId,
  teams,
}: Props) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [incidentType, setIncidentType] = useState(INCIDENT_OPTIONS[0].value);
  const [severity, setSeverity] = useState(SEVERITY_OPTIONS[0].value);

  const teamOptions = teams.map((team) => ({ value: team.id, label: team.name }));
  const canSubmit = teamOptions.length > 0;

  return (
    <form action={recordFixtureDisciplinaryNoteAction} className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <input type="hidden" name="refereeNightId" value={refereeNightId} />
      <input type="hidden" name="fixtureId" value={fixtureId} />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">Disciplinary notes</h3>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Record dissent, fighting or anything SIXFL needs to review. Select the team involved so it is logged accurately.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <CustomSelect name="teamId" label="Team involved" value={teamId} options={teamOptions} onChange={setTeamId} />
        <CustomSelect name="incidentType" label="Incident type" value={incidentType} options={INCIDENT_OPTIONS} onChange={setIncidentType} />
        <CustomSelect name="severity" label="Severity" value={severity} options={SEVERITY_OPTIONS} onChange={setSeverity} />
      </div>

      <textarea
        name="description"
        required
        rows={4}
        placeholder="What happened? Include player names/numbers if known, approximate time, and what action you took."
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/60"
      />

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Record disciplinary note
      </button>
    </form>
  );
}
