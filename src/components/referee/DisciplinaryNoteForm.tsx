// ========================================
// File: src/components/referee/DisciplinaryNoteForm.tsx
// ========================================

"use client";

import { Fragment, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/20/solid";

import { recordFixtureDisciplinaryNoteAction } from "@/app/(public)/referee/actions";
import {
  recordShinPadWarningAction,
  type ShinPadWarningActionState,
} from "@/app/(public)/referee/shin-pad-warning-actions";

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

const INITIAL_SHIN_PAD_WARNING_STATE: ShinPadWarningActionState = {
  status: "idle",
  message: "",
  warningTeamIds: [],
};

const INCIDENT_OPTIONS: Option[] = [
  {
    value: "DISSENT",
    label: "Dissent",
    helper: "Arguing, abuse or refusal to accept decisions.",
  },
  {
    value: "FIGHTING",
    label: "Fighting / violent conduct",
    helper: "Physical confrontation or attempted violence.",
  },
  {
    value: "AGGRESSIVE_CONDUCT",
    label: "Aggressive conduct",
    helper: "Threatening body language, squaring up or intimidation.",
  },
  {
    value: "OFFENSIVE_LANGUAGE",
    label: "Offensive language",
    helper: "Abusive, discriminatory or offensive comments.",
  },
  {
    value: "THREATENING_BEHAVIOUR",
    label: "Threatening behaviour",
    helper: "Threats towards referee, players or staff.",
  },
  {
    value: "OTHER",
    label: "Other",
    helper: "Anything else SIXFL should review.",
  },
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
      <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </label>
      <input type="hidden" name={name} value={value} />

      <Listbox value={value} onChange={onChange}>
        <div className="relative z-50">
          <Listbox.Button className="flex h-11 w-full items-center justify-between rounded-xl border border-white/10 bg-black/40 px-3 text-left text-sm text-white outline-none transition hover:border-white/20 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/15">
            <span className="truncate">{selected.label}</span>
            <ChevronUpDownIcon
              className="ml-3 h-5 w-5 shrink-0 text-white/45"
              aria-hidden="true"
            />
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
                  {({ selected: optionSelected }) => (
                    <>
                      <span
                        className={[
                          "block truncate",
                          optionSelected ? "font-medium text-emerald-300" : "",
                        ].join(" ")}
                      >
                        {option.label}
                      </span>
                      {option.helper ? (
                        <span className="mt-1 block text-xs leading-5 text-white/45">
                          {option.helper}
                        </span>
                      ) : null}
                      {optionSelected ? (
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

function ShinPadWarningSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
    >
      {pending ? "Sending warning..." : "Send shin pad warning"}
    </button>
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
  const [shinPadState, shinPadFormAction] = useActionState(
    recordShinPadWarningAction,
    INITIAL_SHIN_PAD_WARNING_STATE,
  );

  const teamOptions = teams.map((team) => ({ value: team.id, label: team.name }));
  const canSubmit = teamOptions.length > 0;
  const warnedTeamIds = new Set(shinPadState.warningTeamIds);

  return (
    <div className="space-y-4">
      <form
        action={shinPadFormAction}
        className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4"
      >
        <input type="hidden" name="refereeNightId" value={refereeNightId} />
        <input type="hidden" name="fixtureId" value={fixtureId} />

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-100">
            Shin Pad Warning
          </h3>
          <p className="mt-2 text-sm leading-6 text-amber-50/70">
            Tick any team where a number of players were not wearing shin pads. A
            warning email will be sent to the team and permanently recorded for
            admin.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {teams.map((team) => {
            const alreadyRecorded = warnedTeamIds.has(team.id);

            return (
              <label
                key={team.id}
                className={[
                  "flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-sm transition",
                  alreadyRecorded
                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                    : "border-white/10 bg-black/25 text-white hover:border-amber-300/35",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  name="teamIds"
                  value={team.id}
                  disabled={alreadyRecorded}
                  className="h-5 w-5 rounded border-white/20 bg-black text-amber-300 disabled:opacity-50"
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{team.name}</span>
                  <span className="mt-0.5 block text-xs opacity-65">
                    {alreadyRecorded
                      ? "Warning already recorded"
                      : "Tick to send Shin Pad Warning"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {shinPadState.message ? (
          <div
            className={[
              "mt-4 rounded-xl border px-4 py-3 text-sm leading-6",
              shinPadState.status === "error"
                ? "border-red-400/25 bg-red-500/10 text-red-100"
                : shinPadState.status === "success"
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-400/25 bg-black/20 text-amber-50/85",
            ].join(" ")}
          >
            {shinPadState.message}
          </div>
        ) : null}

        <div className="mt-4">
          <ShinPadWarningSubmitButton />
        </div>
      </form>

      <form
        action={recordFixtureDisciplinaryNoteAction}
        className="rounded-2xl border border-white/10 bg-black/20 p-4"
      >
        <input type="hidden" name="refereeNightId" value={refereeNightId} />
        <input type="hidden" name="fixtureId" value={fixtureId} />

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
            Disciplinary notes
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Record dissent, fighting or anything SIXFL needs to review. Select the
            team involved so it is logged accurately.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <CustomSelect
            name="teamId"
            label="Team involved"
            value={teamId}
            options={teamOptions}
            onChange={setTeamId}
          />
          <CustomSelect
            name="incidentType"
            label="Incident type"
            value={incidentType}
            options={INCIDENT_OPTIONS}
            onChange={setIncidentType}
          />
          <CustomSelect
            name="severity"
            label="Severity"
            value={severity}
            options={SEVERITY_OPTIONS}
            onChange={setSeverity}
          />
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
    </div>
  );
}
