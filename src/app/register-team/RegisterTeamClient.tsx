// ========================================
// File: src/app/register-team/RegisterTeamClient.tsx
// ========================================

"use client";

import Link from "next/link";
import { useState } from "react";
import { submitTeamLeadAction } from "./actions";

type TeamForm = {
  teamName: string;
  leagueType: string;
  city: string;
  captainName: string;
  email: string;
  phone: string;
  squadSize: string;
};

const launchAreas = ["York", "Leeds", "Harrogate", "Ripon"];

const leagueOptions = [
  { value: "MENS", label: "Men’s" },
  { value: "WOMENS", label: "Women’s" },
  { value: "YOUTH", label: "Youth" },
];

function getErrorMessage(error: string | null) {
  switch (error) {
    case "team-name":
      return "Please enter your team name.";
    case "league-type":
      return "Please choose a league type.";
    case "city":
      return "Please enter your area or city.";
    case "captain-name":
      return "Please enter the captain name.";
    case "email":
      return "Please enter the email address.";
    default:
      return "";
  }
}

export default function RegisterTeamClient({
  errorParam,
}: {
  errorParam: string | null;
}) {
  const serverError = getErrorMessage(errorParam);

  const [step, setStep] = useState(1);
  const [clientError, setClientError] = useState("");

  const [team, setTeam] = useState<TeamForm>({
    teamName: "",
    leagueType: "",
    city: "",
    captainName: "",
    email: "",
    phone: "",
    squadSize: "",
  });

  const error = clientError || serverError;

  function updateField(field: keyof TeamForm, value: string) {
    setTeam((prev) => ({ ...prev, [field]: value }));
    setClientError("");
  }

  function next() {
    if (step === 1 && !team.teamName.trim()) {
      setClientError("Please enter your team name.");
      return;
    }

    if (step === 2) {
      if (!team.leagueType.trim()) {
        setClientError("Please choose a league type.");
        return;
      }

      if (!team.city.trim()) {
        setClientError("Please enter your area or city.");
        return;
      }
    }

    setClientError("");
    setStep((prev) => Math.min(prev + 1, 3));
  }

  function back() {
    setClientError("");
    setStep((prev) => Math.max(prev - 1, 1));
  }

  function validateBeforeSubmit(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) {
    if (!team.captainName.trim()) {
      e.preventDefault();
      setClientError("Please enter the captain name.");
      return;
    }

    if (!team.email.trim()) {
      e.preventDefault();
      setClientError("Please enter the email address.");
      return;
    }

    setClientError("");
  }

  const progressWidth = step === 1 ? "33%" : step === 2 ? "66%" : "100%";

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div>
              <div className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Register your team
              </div>

              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Register your team for
                <span className="block text-emerald-400">
                  SIXFL.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
                Built for teams who want properly run 6-a-side football.
                Register today and we’ll be in touch with next steps as leagues
                are organised in your area.
              </p>

              <div className="mt-8 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Simple pricing
                </p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-4xl font-black tracking-tight sm:text-5xl">
                    £40
                  </span>
                  <span className="pb-1 text-white/70">
                    per team / per week
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/75">
                  Around £5 per player per match for most squads.
                </p>
              </div>

              <div className="mt-8">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Launch areas
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  {launchAreas.map((area) => (
                    <span
                      key={area}
                      className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white/85"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="font-semibold text-white">Refereed matches</h3>
                  <p className="mt-1 text-sm leading-6 text-white/65">
                    Weekly games run with proper structure and matchday
                    standards.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="font-semibold text-white">
                    Reliable fixtures
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/65">
                    Clear scheduling, consistent communication and less chaos
                    for captains.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="font-semibold text-white">Live tables</h3>
                  <p className="mt-1 text-sm leading-6 text-white/65">
                    Results, standings and league updates handled
                    professionally.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <h3 className="font-semibold text-white">
                    Built for captains
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-white/65">
                    A smoother experience than chasing everything through group
                    chats.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
              <div className="mb-6">
                <h2 className="text-3xl font-extrabold tracking-tight">
                  Register Your Team
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Complete the form below and we’ll register your team interest
                  with SIXFL.
                </p>
              </div>

              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                  <span>Step {step} of 3</span>
                  <span>
                    {step === 1
                      ? "Team basics"
                      : step === 2
                        ? "League details"
                        : "Captain details"}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                    style={{ width: progressWidth }}
                  />
                </div>
              </div>

              {error && (
                <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <form action={submitTeamLeadAction} className="space-y-5">
                <input type="hidden" name="teamName" value={team.teamName} />
                <input type="hidden" name="leagueType" value={team.leagueType} />
                <input type="hidden" name="city" value={team.city} />
                <input
                  type="hidden"
                  name="captainName"
                  value={team.captainName}
                />
                <input type="hidden" name="email" value={team.email} />
                <input type="hidden" name="phone" value={team.phone} />
                <input type="hidden" name="squadSize" value={team.squadSize} />

                {step === 1 && (
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Team name *
                      </label>
                      <input
                        placeholder="e.g. Ripon Athletic"
                        value={team.teamName}
                        onChange={(e) =>
                          updateField("teamName", e.target.value)
                        }
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={next}
                      className="h-12 w-full rounded-full bg-emerald-500 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
                    >
                      CONTINUE
                    </button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        League type *
                      </label>
                      <select
                        value={team.leagueType}
                        onChange={(e) =>
                          updateField("leagueType", e.target.value)
                        }
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition focus:border-emerald-400"
                      >
                        <option value="">Select league type</option>
                        {leagueOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Area / city *
                      </label>
                      <input
                        placeholder="e.g. York"
                        value={team.city}
                        onChange={(e) => updateField("city", e.target.value)}
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Approx squad size
                      </label>
                      <input
                        placeholder="e.g. 8"
                        value={team.squadSize}
                        onChange={(e) =>
                          updateField("squadSize", e.target.value)
                        }
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={back}
                        className="h-12 flex-1 rounded-full border border-white/10 bg-white/[0.03] text-sm font-bold text-white transition hover:bg-white/[0.06]"
                      >
                        Back
                      </button>

                      <button
                        type="button"
                        onClick={next}
                        className="h-12 flex-1 rounded-full bg-emerald-500 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
                      >
                        CONTINUE
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Captain name *
                      </label>
                      <input
                        placeholder="Your full name"
                        value={team.captainName}
                        onChange={(e) =>
                          updateField("captainName", e.target.value)
                        }
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Email address *
                      </label>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={team.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Phone number
                      </label>
                      <input
                        type="tel"
                        placeholder="Best contact number"
                        value={team.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        className="h-12 w-full rounded-2xl border border-white/10 bg-black/50 px-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={back}
                        className="h-12 flex-1 rounded-full border border-white/10 bg-white/[0.03] text-sm font-bold text-white transition hover:bg-white/[0.06]"
                      >
                        Back
                      </button>

                      <button
                        type="submit"
                        onClick={validateBeforeSubmit}
                        className="h-12 flex-1 rounded-full bg-emerald-500 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
                      >
                        SUBMIT TEAM
                      </button>
                    </div>
                  </div>
                )}
              </form>

              <p className="mt-6 text-xs leading-5 text-white/45">
                By registering, you’re telling us you’d like to join a SIXFL
                league as soon as spaces become available in your area.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6 lg:px-8 lg:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Not ready yet?
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            See pricing and how the league works.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold tracking-wide text-black transition hover:bg-emerald-400"
            >
              VIEW PRICING
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold tracking-wide text-white transition hover:bg-white/10"
            >
              ASK A QUESTION
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}