// ========================================
// File: src/components/player-pool/PlayerPoolProfileForm.tsx
// ========================================

"use client";

import { useMemo, useState } from "react";

import { submitPlayerPoolProfileAction } from "@/app/(public)/player-pool/actions";
import type {
  PlayerPoolLeagueOption,
  PlayerPoolLeaguePreference,
} from "@/lib/player-pool/leagues";

export type PlayerPoolFormDefaults = {
  profileToken?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  ageBand?: string;
  positions?: string[];
  preferredPosition?: string;
  experienceSummary?: string;
  availabilityLevel?: string;
  preferredNights?: string[];
  area?: string;
  leagueId?: string | null;
  leaguePreferences?: PlayerPoolLeaguePreference[];
  profileSubmitted?: boolean;
  availabilitySummary?: string;
  consentShareProfile?: boolean;
  consentContact?: boolean;
};

type Props = {
  defaults?: PlayerPoolFormDefaults;
  leagues: PlayerPoolLeagueOption[];
  error?: string | null;
};

const ageBands = ["16–17", "18–20", "21–24", "25–29", "30–39", "40+"];
const positions = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
  "Happy to play anywhere",
];
const preferredPositions = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
  "No strong preference",
];
const experienceOptions = [
  "New to organised football or returning after a break",
  "Mainly casual or social football",
  "Regular small-sided football player",
  "Regular 11-a-side club player",
  "Experienced competitive player",
];
const availabilityOptions = [
  "Every week",
  "Most weeks",
  "Two or three times a month",
  "Occasionally or as a backup",
];

const knownLeagueAvailabilityOptions = [
  { value: "MOST_WEEKS", label: "Yes, most weeks" },
  { value: "SOMETIMES", label: "Sometimes" },
  { value: "NOT_AVAILABLE", label: "No" },
] as const;

type KnownLeagueAvailability =
  (typeof knownLeagueAvailabilityOptions)[number]["value"];

function dayLabel(value: string | null | undefined) {
  if (!value) return null;
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function leagueMeta(league: PlayerPoolLeagueOption) {
  return [
    dayLabel(league.dayOfWeek)
      ? `${dayLabel(league.dayOfWeek)} evenings`
      : null,
    league.kickoffInfo,
    league.venueName,
    league.area,
  ].filter((value): value is string => Boolean(value));
}

function leagueQuestion(league: PlayerPoolLeagueOption) {
  const day = dayLabel(league.dayOfWeek);
  if (day && league.kickoffInfo) {
    return `Are you usually available to play on ${day} evenings (${league.kickoffInfo})?`;
  }
  if (day) return `Are you usually available to play on ${day} evenings?`;
  return `Are you usually available for ${league.name}?`;
}

function RadioCards({
  legend,
  name,
  options,
  defaultValue,
  columns = "sm:grid-cols-2",
}: {
  legend: string;
  name: string;
  options: string[];
  defaultValue?: string;
  columns?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-white">{legend}</legend>
      <div className={`mt-3 grid gap-3 ${columns}`}>
        {options.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/75 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.06]"
          >
            <input
              type="radio"
              name={name}
              value={option}
              defaultChecked={defaultValue === option}
              required
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckboxCards({
  legend,
  name,
  options,
  defaults,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<string | readonly [string, string]>;
  defaults?: string[];
}) {
  const selected = new Set(defaults ?? []);

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-white">{legend}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const value = typeof option === "string" ? option : option[0];
          const label = typeof option === "string" ? option : option[1];

          return (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.06]"
            >
              <input
                type="checkbox"
                name={name}
                value={value}
                defaultChecked={selected.has(value)}
                className="h-4 w-4 shrink-0 accent-emerald-400"
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function LeagueCards({
  leagues,
  selectedLeagueIds,
}: {
  leagues: PlayerPoolLeagueOption[];
  selectedLeagueIds: Set<string>;
}) {
  if (leagues.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm leading-6 text-white/55">
        There are no other live SIXFL leagues to choose from at the moment. Please add a note below and SIXFL will contact you.
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {leagues.map((league) => {
        const meta = leagueMeta(league);

        return (
          <label
            key={league.id}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-emerald-400/35 hover:bg-emerald-500/[0.06]"
          >
            <input
              type="checkbox"
              name="leagueIds"
              value={league.id}
              defaultChecked={selectedLeagueIds.has(league.id)}
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
            />
            <span className="min-w-0">
              <span className="block font-semibold text-white">{league.name}</span>
              {league.season ? (
                <span className="mt-0.5 block text-xs text-white/40">{league.season}</span>
              ) : null}
              {meta.length ? (
                <span className="mt-2 block text-sm leading-6 text-white/60">
                  {meta.join(" · ")}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function initialKnownLeagueAvailability(
  defaults: PlayerPoolFormDefaults,
  knownLeague: PlayerPoolLeagueOption | null,
): KnownLeagueAvailability | "" {
  if (!knownLeague) return "";

  const saved = defaults.leaguePreferences?.find(
    (preference) => preference.leagueId === knownLeague.id,
  )?.availabilityStatus;

  if (
    saved === "MOST_WEEKS" ||
    saved === "SOMETIMES" ||
    saved === "NOT_AVAILABLE"
  ) {
    return saved;
  }

  if (!defaults.profileSubmitted) return "";

  return defaults.availabilityLevel === "Occasionally or as a backup"
    ? "SOMETIMES"
    : "MOST_WEEKS";
}

export default function PlayerPoolProfileForm({
  defaults = {},
  leagues,
  error,
}: Props) {
  const knownLeague = defaults.leagueId
    ? leagues.find((league) => league.id === defaults.leagueId) ?? null
    : null;
  const startingAvailability = initialKnownLeagueAvailability(
    defaults,
    knownLeague,
  );
  const [knownAvailability, setKnownAvailability] = useState<
    KnownLeagueAvailability | ""
  >(startingAvailability);
  const [showLeagueChooser, setShowLeagueChooser] = useState(
    !knownLeague || startingAvailability === "NOT_AVAILABLE",
  );

  const selectedLeagueIds = useMemo(
    () =>
      new Set(
        (defaults.leaguePreferences ?? [])
          .filter(
            (preference) => preference.availabilityStatus !== "NOT_AVAILABLE",
          )
          .map((preference) => preference.leagueId),
      ),
    [defaults.leaguePreferences],
  );

  const alternativeLeagues = useMemo(() => {
    const knownArea = knownLeague?.area?.trim().toLowerCase() ?? "";

    return leagues
      .filter((league) => league.id !== knownLeague?.id)
      .slice()
      .sort((left, right) => {
        if (knownArea) {
          const leftNearby = left.area?.trim().toLowerCase() === knownArea;
          const rightNearby = right.area?.trim().toLowerCase() === knownArea;
          if (leftNearby !== rightNearby) return leftNearby ? -1 : 1;
        }

        return `${left.area ?? ""}-${left.name}`.localeCompare(
          `${right.area ?? ""}-${right.name}`,
        );
      });
  }, [knownLeague, leagues]);

  const knownLeagueIsAvailable =
    knownAvailability === "MOST_WEEKS" || knownAvailability === "SOMETIMES";
  const showAlternatives =
    !knownLeague || showLeagueChooser || knownAvailability === "NOT_AVAILABLE";

  return (
    <form action={submitPlayerPoolProfileAction} className="space-y-8">
      <input type="hidden" name="profileToken" value={defaults.profileToken ?? ""} />
      <input
        type="hidden"
        name="contextLeagueId"
        value={knownLeague?.id ?? ""}
      />
      {knownLeague && knownLeagueIsAvailable ? (
        <input type="hidden" name="leagueIds" value={knownLeague.id} />
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
          {error}
        </div>
      ) : null}

      {knownLeague ? (
        <section className="space-y-5 rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              Your SIXFL league
            </div>
            <h2 className="mt-2 text-xl font-black text-white">
              {knownLeague.name}
            </h2>
            {knownLeague.season ? (
              <p className="mt-1 text-sm text-white/45">{knownLeague.season}</p>
            ) : null}
            {leagueMeta(knownLeague).length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {leagueMeta(knownLeague).map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-semibold text-white/65"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-white">
              {leagueQuestion(knownLeague)}
            </legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {knownLeagueAvailabilityOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75 transition hover:border-emerald-400/35 hover:bg-emerald-500/[0.07]"
                >
                  <input
                    type="radio"
                    name="knownLeagueAvailability"
                    value={option.value}
                    checked={knownAvailability === option.value}
                    onChange={() => {
                      setKnownAvailability(option.value);
                      setShowLeagueChooser(option.value === "NOT_AVAILABLE");
                    }}
                    required
                    className="h-4 w-4 shrink-0 accent-emerald-400"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => {
              setKnownAvailability("NOT_AVAILABLE");
              setShowLeagueChooser(true);
            }}
            className="text-left text-sm font-semibold text-emerald-200 underline decoration-emerald-400/40 underline-offset-4 transition hover:text-emerald-100"
          >
            That isn&apos;t the right league
          </button>
        </section>
      ) : null}

      {showAlternatives ? (
        <section className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              League availability
            </p>
            <h2 className="mt-2 text-xl font-black text-white">
              {knownLeague
                ? "Would you like to be considered for another SIXFL league?"
                : "Which SIXFL leagues could you play in?"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/55">
              Select every league that genuinely works for its location, day and playing time.
            </p>
          </div>

          <LeagueCards
            leagues={knownLeague ? alternativeLeagues : leagues}
            selectedLeagueIds={selectedLeagueIds}
          />
        </section>
      ) : null}

      <section className="space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            Your details
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            Tell us who you are
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold text-white/80 sm:col-span-2">
            <span>Full name</span>
            <input
              name="fullName"
              required
              autoComplete="name"
              defaultValue={defaults.fullName ?? ""}
              placeholder="Your full name"
              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
            />
          </label>
          <label className="space-y-2 text-sm font-semibold text-white/80">
            <span>Email address</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={defaults.email ?? ""}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
            />
          </label>
          <label className="space-y-2 text-sm font-semibold text-white/80">
            <span>Mobile number</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={defaults.phone ?? ""}
              placeholder="Optional"
              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
            />
          </label>
        </div>
      </section>

      <RadioCards
        legend="Age group"
        name="ageBand"
        options={ageBands}
        defaultValue={defaults.ageBand}
        columns="grid-cols-2 sm:grid-cols-3"
      />

      <CheckboxCards
        legend="Which positions can you play? Select all that apply."
        name="positions"
        options={positions}
        defaults={defaults.positions}
      />

      <RadioCards
        legend="Which position do you prefer?"
        name="preferredPosition"
        options={preferredPositions}
        defaultValue={defaults.preferredPosition}
      />

      <RadioCards
        legend="Which best describes your current football experience?"
        name="experienceSummary"
        options={experienceOptions}
        defaultValue={defaults.experienceSummary}
      />

      <RadioCards
        legend="How often are you usually available?"
        name="availabilityLevel"
        options={availabilityOptions}
        defaultValue={defaults.availabilityLevel}
      />

      <section className="space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-white/80">
          <span>Other area or travel limits</span>
          <input
            name="area"
            defaultValue={defaults.area ?? ""}
            placeholder="Optional — for example Harrogate only, or within 20 minutes of Ripon"
            className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
          />
        </label>

        <label className="block space-y-2 text-sm font-semibold text-white/80">
          <span>Anything teams should know?</span>
          <textarea
            name="availabilitySummary"
            rows={4}
            defaultValue={defaults.availabilitySummary ?? ""}
            placeholder="Optional — playing background, transport, preferred role or whether you are joining with friends."
            className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/50"
          />
        </label>
      </section>

      <section className="space-y-3 rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
        <p className="text-sm leading-6 text-white/70">
          Captains see only your anonymised playing profile. Your name, email and mobile number stay private until you agree to an introduction.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/75">
          <input
            type="checkbox"
            name="consentShareProfile"
            defaultChecked={defaults.consentShareProfile}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
          />
          <span>
            I agree that SIXFL may show my anonymised playing profile to relevant team captains.
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/75">
          <input
            type="checkbox"
            name="consentContact"
            defaultChecked={defaults.consentContact}
            className="mt-1 h-4 w-4 shrink-0 accent-emerald-400"
          />
          <span>SIXFL may contact me if a team asks to be introduced.</span>
        </label>
      </section>

      <button
        type="submit"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-black tracking-wide text-black transition hover:bg-emerald-400"
      >
        JOIN SIXFL PLAYERPOOL
      </button>
    </form>
  );
}
