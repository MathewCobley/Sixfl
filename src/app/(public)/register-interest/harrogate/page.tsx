// ========================================
// File: src/app/(public)/register-interest/harrogate/page.tsx
// ========================================

import Image from "next/image";
import Link from "next/link";

import { submitRegisterInterest } from "../actions";

export const metadata = {
  title: "Join the Harrogate Tuesday League | SIXFL",
  description:
    "Register a team, join as a player or register referee interest for the SIXFL Men's Harrogate West Tuesday Rossett League.",
};

type LeadType = "TEAM" | "PLAYER" | "REFEREE";

type PageSearchParams = Promise<{
  type?: string;
  error?: string;
}>;

const badgeUrl = "/leagues/harrogate-tuesday-mens-rossett-512.png";

function getLeadType(value?: string): LeadType {
  const normalised = String(value ?? "").trim().toUpperCase();
  if (normalised === "PLAYER") return "PLAYER";
  if (normalised === "REFEREE") return "REFEREE";
  return "TEAM";
}

function typeHref(type: LeadType) {
  return `/register-interest?area=Harrogate&night=Tuesday&type=${type.toLowerCase()}`;
}

function getCopy(type: LeadType) {
  if (type === "PLAYER") {
    return {
      badge: "SIXFL • PLAYER INTEREST",
      title: "Join the Harrogate player list",
      intro:
        "Leave your details and we’ll contact you when a Harrogate Tuesday team needs players.",
      submit: "JOIN PLAYER LIST",
      pills: ["Harrogate West", "Men’s league", "Tuesday nights"],
    };
  }

  if (type === "REFEREE") {
    return {
      badge: "SIXFL • REFEREE INTEREST",
      title: "Referee in Harrogate",
      intro:
        "Register your interest in regular Tuesday night refereeing opportunities at Rossett Sports Centre.",
      submit: "REGISTER REFEREE INTEREST",
      pills: ["Harrogate West", "Tuesday nights", "Regular fixtures"],
    };
  }

  return {
    badge: "SIXFL • TEAM INTEREST",
    title: "Register your Harrogate team",
    intro:
      "Register your team for the SIXFL Men’s Harrogate West Tuesday Rossett League. It takes less than a minute.",
    submit: "REGISTER TEAM INTEREST",
    pills: ["Harrogate West", "Men’s league", "Tuesday nights"],
  };
}

export default async function HarrogateRegisterInterestPage({
  searchParams,
}: {
  searchParams?: PageSearchParams;
}) {
  const sp = (await searchParams) ?? {};
  const leadType = getLeadType(sp.type);
  const copy = getCopy(leadType);
  const hasError = sp.error === "missing";

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-white sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-white/60 transition hover:text-white"
          >
            ← Back to home
          </Link>

          <div className="flex flex-wrap gap-2">
            {(["TEAM", "PLAYER", "REFEREE"] as LeadType[]).map((type) => (
              <Link
                key={type}
                href={typeHref(type)}
                className={[
                  "inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-bold tracking-[0.16em] transition",
                  leadType === type
                    ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                    : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                {type === "TEAM" ? "Team" : type === "PLAYER" ? "Player" : "Referee"}
              </Link>
            ))}
          </div>
        </div>

        <section className="relative isolate overflow-hidden rounded-3xl border border-emerald-500/20 bg-[radial-gradient(circle_at_50%_42%,rgba(16,185,129,0.14),transparent_46%),rgba(255,255,255,0.05)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 w-[360px] -translate-x-1/2 -translate-y-1/2 opacity-[0.13] sm:w-[500px] sm:opacity-[0.26]"
          >
            <Image
              src={badgeUrl}
              alt=""
              width={900}
              height={900}
              priority
              className="h-auto w-full object-contain drop-shadow-[0_24px_70px_rgba(16,185,129,0.22)]"
            />
          </div>

          <div className="relative z-10">
            <div className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-[11px] font-bold tracking-[0.18em] text-emerald-300">
              {copy.badge}
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              {copy.title}
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">
              {copy.intro}
            </p>

            <p className="mt-3 text-sm font-medium text-white/50">
              No payment now • No commitment • Just register interest
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {copy.pills.map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-emerald-300"
                >
                  {pill}
                </span>
              ))}
            </div>

            {hasError ? (
              <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                Please complete the required fields.
              </div>
            ) : null}

            <form action={submitRegisterInterest} className="mt-7 grid gap-4">
              <input type="hidden" name="interestType" value={leadType} />
              <input
                type="hidden"
                name="source"
                value="harrogate-west-tuesday-rossett"
              />
              <input type="hidden" name="area" value="Harrogate" />
              <input type="hidden" name="leagueType" value="MENS" />
              <input type="hidden" name="preferredNights" value="TUESDAY" />

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

                {leadType === "TEAM" ? (
                  <Field
                    label="Team name"
                    name="teamName"
                    placeholder="Your team name"
                    required
                  />
                ) : leadType === "REFEREE" ? (
                  <div>
                    <label
                      htmlFor="experienceLevel"
                      className="mb-2 block text-sm font-semibold text-white/80"
                    >
                      Experience
                    </label>
                    <select
                      id="experienceLevel"
                      name="experienceLevel"
                      defaultValue=""
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/50"
                    >
                      <option value="" className="bg-black">
                        Select experience
                      </option>
                      <option value="New to refereeing" className="bg-black">
                        New to refereeing
                      </option>
                      <option value="Some experience" className="bg-black">
                        Some experience
                      </option>
                      <option value="Regular referee" className="bg-black">
                        Regular referee
                      </option>
                      <option value="Qualified referee" className="bg-black">
                        Qualified referee
                      </option>
                    </select>
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <button
                type="submit"
                className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:scale-[1.01] hover:bg-emerald-400 sm:w-auto"
              >
                {copy.submit}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
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
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-semibold text-white/80"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-500/50"
      />
    </div>
  );
}
