// ========================================
// File: src/app/register-interest/page.tsx
// ========================================

import Link from "next/link";
import { submitRegisterInterest } from "./actions";

type SearchParams = Promise<{
  success?: string;
  error?: string;
  type?: string;
}>;

type InterestTypeValue = "TEAM" | "PLAYER" | "REFEREE";

type LeadTypeConfig = {
  type: InterestTypeValue;
  badge: string;
  title: string;
  intro: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  reassuranceText: string;
  showTeamName: boolean;
  showLeagueType: boolean;
  showExperience: boolean;
  showFreeKit: boolean;
  notesLabel: string;
  notesPlaceholder: string;
};

const leadTypeConfig: Record<InterestTypeValue, LeadTypeConfig> = {
  TEAM: {
    type: "TEAM",
    badge: "SIXFL • TEAM INTEREST",
    title: "Register your team",
    intro:
      "Register interest for a men’s, women’s or youth team and be first to hear when SIXFL opens in your area.",
    submitLabel: "REGISTER TEAM INTEREST",
    successTitle: "Team interest registered",
    successBody:
      "Thanks — your team details have been registered. We’ll be in touch when league spaces open in your area.",
    reassuranceText: "No payment now • No commitment • Just register interest",
    showTeamName: true,
    showLeagueType: true,
    showExperience: false,
    showFreeKit: true,
    notesLabel: "Notes",
    notesPlaceholder:
      "Anything useful to know? For example: likely squad size, preferred nights, area you want to play in, or whether you are exploring a men’s, women’s or youth entry.",
  },
  PLAYER: {
    type: "PLAYER",
    badge: "SIXFL • PLAYER INTEREST",
    title: "Join as a player",
    intro:
      "Looking for a men’s, women’s or youth team to join? Leave your details and we’ll contact you when places open or teams need players.",
    submitLabel: "JOIN AS A PLAYER",
    successTitle: "Player interest registered",
    successBody:
      "Thanks — you’re now on the SIXFL player list. We’ll be in touch when teams need players or spaces open in your area.",
    reassuranceText: "No payment now • No commitment • Just register interest",
    showTeamName: false,
    showLeagueType: true,
    showExperience: false,
    showFreeKit: false,
    notesLabel: "Notes",
    notesPlaceholder:
      "Anything useful to know? For example: preferred area, preferred nights, position, age group, playing standard, or whether you are joining with friends.",
  },
  REFEREE: {
    type: "REFEREE",
    badge: "SIXFL • REFEREE INTEREST",
    title: "Register referee interest",
    intro:
      "Interested in refereeing for SIXFL? Leave your details and we’ll contact you as launch plans develop in your area.",
    submitLabel: "REGISTER REFEREE INTEREST",
    successTitle: "Referee interest registered",
    successBody:
      "Thanks — your referee interest has been registered. We’ll be in touch as SIXFL launch plans develop in your area.",
    reassuranceText: "No commitment • Just register your interest",
    showTeamName: false,
    showLeagueType: false,
    showExperience: true,
    showFreeKit: false,
    notesLabel: "Experience / Notes",
    notesPlaceholder:
      "Tell us anything useful. For example: refereeing experience, qualifications, availability, preferred areas, or whether you are interested in regular weekly games.",
  },
};

const preferredNightOptions = [
  { label: "Monday", value: "MONDAY" },
  { label: "Tuesday", value: "TUESDAY" },
  { label: "Wednesday", value: "WEDNESDAY" },
  { label: "Thursday", value: "THURSDAY" },
  { label: "Friday", value: "FRIDAY" },
  { label: "Saturday", value: "SATURDAY" },
  { label: "Sunday", value: "SUNDAY" },
  { label: "Any", value: "ANY" },
] as const;

function getLeadType(rawType?: string): InterestTypeValue {
  const value = String(rawType ?? "").trim().toUpperCase();

  if (value === "PLAYER") return "PLAYER";
  if (value === "REFEREE") return "REFEREE";
  return "TEAM";
}

function getErrorMessage(rawError?: string): string | null {
  switch (rawError) {
    case "missing":
      return "Please complete the required fields.";
    default:
      return null;
  }
}

export default async function RegisterInterestPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (await searchParams) ?? {};
  const success = sp.success === "1";
  const leadType = getLeadType(sp.type);
  const config = leadTypeConfig[leadType];
  const errorMessage = getErrorMessage(sp.error);

  if (success) {
    return (
      <div className="min-h-screen bg-black px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="text-sm text-white/60 transition hover:text-white"
            >
              ← Back to home
            </Link>

            <div className="flex flex-wrap gap-2">
              <TypeLink
                href="/register-interest?type=team"
                label="Team"
                active={leadType === "TEAM"}
              />
              <TypeLink
                href="/register-interest?type=player"
                label="Player"
                active={leadType === "PLAYER"}
              />
              <TypeLink
                href="/register-interest?type=referee"
                label="Referee"
                active={leadType === "REFEREE"}
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
            <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300">
              {config.badge}
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              {config.successTitle}
            </h1>

            <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-200">
              <p className="text-base leading-7">{config.successBody}</p>
            </div>

            <div className="mt-6 text-sm leading-7 text-white/65">
              We’ve saved your details and will contact you as launch plans
              develop.
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                BACK TO HOME
              </Link>

              <Link
                href={`/register-interest?type=${leadType.toLowerCase()}`}
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
              >
                ADD ANOTHER
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-white/60 transition hover:text-white"
          >
            ← Back to home
          </Link>

          <div className="flex flex-wrap gap-2">
            <TypeLink
              href="/register-interest?type=team"
              label="Team"
              active={leadType === "TEAM"}
            />
            <TypeLink
              href="/register-interest?type=player"
              label="Player"
              active={leadType === "PLAYER"}
            />
            <TypeLink
              href="/register-interest?type=referee"
              label="Referee"
              active={leadType === "REFEREE"}
            />
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300">
            {config.badge}
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            {config.title}
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">
            {config.intro}
          </p>

          <p className="mt-3 text-sm font-medium text-white/50">
            {config.reassuranceText}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {leadType === "REFEREE" ? (
              <>
                <Pill text="Weekly games" />
                <Pill text="Flexible availability" />
                <Pill text="Launch opportunities" />
              </>
            ) : (
              <>
                <Pill text="Men’s leagues" />
                <Pill text="Women’s leagues" />
                <Pill text="Youth leagues" />
              </>
            )}
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}

          <form action={submitRegisterInterest} className="mt-8 grid gap-4">
            <input type="hidden" name="interestType" value={config.type} />
            <input type="hidden" name="source" value="register-interest-page" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Your name"
                name="contactName"
                placeholder="Your full name"
                required
              />
              <Field
                label="Email address"
                name="email"
                type="email"
                placeholder="your@email.com"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phone number"
                name="phone"
                type="tel"
                placeholder="Optional"
              />
              {config.showTeamName ? (
                <Field
                  label="Team name"
                  name="teamName"
                  placeholder="Your team name"
                />
              ) : (
                <div />
              )}
            </div>

            <div
              className={`grid gap-4 ${
                config.showLeagueType ? "sm:grid-cols-2" : "sm:grid-cols-1"
              }`}
            >
              <SelectField
                label="Area"
                name="area"
                required
                options={["York", "Leeds", "Harrogate", "Ripon", "Other"]}
              />

              {config.showLeagueType ? (
                <SelectField
                  label="League type"
                  name="leagueType"
                  required
                  options={[
                    { label: "Men’s", value: "MENS" },
                    { label: "Women’s", value: "WOMENS" },
                    { label: "Youth", value: "YOUTH" },
                  ]}
                />
              ) : null}
            </div>

            <MultiCheckboxField
              label="Preferred nights"
              helperText="Select all that work for you."
              name="preferredNights"
              options={preferredNightOptions}
            />

            {config.showExperience ? (
              <SelectField
                label="Experience level"
                name="experienceLevel"
                options={[
                  "New to refereeing",
                  "Some experience",
                  "Regular referee",
                  "Qualified referee",
                ]}
              />
            ) : null}

            {config.showFreeKit ? (
              <CheckboxField
                name="wantsFreeKit"
                label="I’d like to be considered for the founding teams free kit offer"
              />
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-white/80">
                {config.notesLabel}
              </label>
              <textarea
                name="message"
                rows={5}
                placeholder={config.notesPlaceholder}
                className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-500/50"
              />
            </div>

            <CheckboxField
              name="marketingConsent"
              label="I’m happy to receive SIXFL launch updates by email"
            />

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.02] hover:bg-emerald-400"
              >
                {config.submitLabel}
              </button>

              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-6 text-sm font-extrabold tracking-wide text-white transition hover:bg-white/10"
              >
                BACK TO HOME
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function TypeLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-bold tracking-[0.18em] transition",
        active
          ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
          : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-white/80">
        {label}
      </label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-500/50"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  required = false,
}: {
  label: string;
  name: string;
  options: Array<string | { label: string; value: string }>;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-white/80">
        {label}
      </label>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50"
      >
        <option value="" disabled className="bg-black text-white/60">
          Select {label.toLowerCase()}
        </option>

        {options.map((option) => {
          if (typeof option === "string") {
            return (
              <option key={option} value={option} className="bg-black">
                {option}
              </option>
            );
          }

          return (
            <option key={option.value} value={option.value} className="bg-black">
              {option.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function CheckboxField({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80">
      <input
        type="checkbox"
        name={name}
        value="true"
        className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500"
      />
      <span>{label}</span>
    </label>
  );
}

function MultiCheckboxField({
  label,
  helperText,
  name,
  options,
}: {
  label: string;
  helperText?: string;
  name: string;
  options: readonly { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-white/80">
        {label}
      </label>

      {helperText ? (
        <p className="mb-3 text-xs leading-6 text-white/50">{helperText}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80 transition hover:border-emerald-500/30 hover:bg-white/[0.04]"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-black text-emerald-500"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-emerald-300">
      {text}
    </span>
  );
}