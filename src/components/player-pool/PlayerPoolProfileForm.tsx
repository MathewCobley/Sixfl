// ========================================
// File: src/components/player-pool/PlayerPoolProfileForm.tsx
// ========================================

import { submitPlayerPoolProfileAction } from "@/app/(public)/player-pool/actions";

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
  leagueName?: string | null;
  availabilitySummary?: string;
  consentShareProfile?: boolean;
  consentContact?: boolean;
};

const ageBands = ["16–17", "18–20", "21–24", "25–29", "30–39", "40+"];
const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Happy to play anywhere"];
const preferredPositions = ["Goalkeeper", "Defender", "Midfielder", "Forward", "No strong preference"];
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
const nightOptions = [
  ["MONDAY", "Monday"],
  ["TUESDAY", "Tuesday"],
  ["WEDNESDAY", "Wednesday"],
  ["THURSDAY", "Thursday"],
  ["FRIDAY", "Friday"],
  ["ANY", "Flexible"],
] as const;

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

export default function PlayerPoolProfileForm({
  defaults = {},
  error,
}: {
  defaults?: PlayerPoolFormDefaults;
  error?: string | null;
}) {
  return (
    <form action={submitPlayerPoolProfileAction} className="space-y-8">
      <input type="hidden" name="profileToken" value={defaults.profileToken ?? ""} />
      <input type="hidden" name="leagueId" value={defaults.leagueId ?? ""} />

      {error ? (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
          {error}
        </div>
      ) : null}

      {defaults.leagueName ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
            Preferred league
          </div>
          <div className="mt-2 font-semibold text-white">{defaults.leagueName}</div>
        </div>
      ) : null}

      <section className="space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
            Your details
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Tell us who you are</h2>
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

      <CheckboxCards
        legend="Which evenings can you usually play? Select all that apply."
        name="preferredNights"
        options={nightOptions}
        defaults={defaults.preferredNights}
      />

      <section className="space-y-4">
        <label className="block space-y-2 text-sm font-semibold text-white/80">
          <span>Which area can you play in?</span>
          <input
            name="area"
            required
            defaultValue={defaults.area ?? ""}
            placeholder="For example Harrogate or North Yorkshire Heartlands"
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
          <span>I agree that SIXFL may show my anonymised playing profile to relevant team captains.</span>
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
