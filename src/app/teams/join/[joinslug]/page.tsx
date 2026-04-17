// ========================================
// File: src/app/teams/join/[joinSlug]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { submitTeamJoinProspectAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Join Team | SIXFL",
};

type SearchParams = {
  saved?: string;
  error?: string;
};

const AGE_BAND_OPTIONS = [
  {
    value: "16-18",
    label: "16–18",
    description: "You are in the younger player bracket.",
  },
  {
    value: "18-25",
    label: "18–25",
    description: "Early adult age group.",
  },
  {
    value: "25-35",
    label: "25–35",
    description: "Prime years and still flying around.",
  },
  {
    value: "35+",
    label: "35 and over",
    description: "Experienced and still doing the business.",
  },
] as const;

const POSITION_OPTIONS = [
  {
    value: "Goalkeeper",
    label: "Goalkeeper",
    description: "You mainly want to play in goal.",
  },
  {
    value: "Outfield",
    label: "Outfield",
    description: "You prefer to play out on the pitch.",
  },
  {
    value: "Both",
    label: "Both",
    description: "Happy to play in goal or outfield.",
  },
] as const;

const EXPERIENCE_OPTIONS = [
  {
    value: "New to football",
    label: "New to football",
    description: "Just getting started and up for it.",
  },
  {
    value: "Casual player",
    label: "Casual player",
    description: "Social player who wants a good game each week.",
  },
  {
    value: "Can play a bit",
    label: "Can play a bit",
    description: "Comfortable on the ball and knows the basics.",
  },
  {
    value: "Good player",
    label: "Good player",
    description: "Strong standard and can contribute straight away.",
  },
  {
    value: "Top baller",
    label: "Top baller",
    description: "Should probably be getting scouted by now.",
  },
] as const;

const AVAILABILITY_OPTIONS = [
  {
    value: "Available every week",
    label: "Available every week",
    description: "Looking to play regularly.",
  },
  {
    value: "Usually available",
    label: "Usually available",
    description: "Can make most weeks.",
  },
  {
    value: "Sometimes available",
    label: "Sometimes available",
    description: "Can play but not every week.",
  },
  {
    value: "Rarely available",
    label: "Rarely available",
    description: "Only available now and then.",
  },
  {
    value: "Not sure yet",
    label: "Not sure yet",
    description: "Still figuring out schedule and commitments.",
  },
] as const;

const NIGHT_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Any",
] as const;

function getSavedMessage(saved?: string) {
  switch (saved) {
    case "1":
      return "Thanks — your details have been sent to the team organiser.";
    case "already-registered":
      return "You have already registered interest for this team.";
    default:
      return null;
  }
}

function OptionCards({
  name,
  options,
}: {
  name: string;
  options: ReadonlyArray<{
    value: string;
    label: string;
    description: string;
  }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => (
        <label
          key={option.value}
          className="group block cursor-pointer rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-emerald-500/30 hover:bg-white/[0.06]"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            className="peer sr-only"
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition peer-checked:border-emerald-400/50 peer-checked:bg-emerald-500/10 peer-checked:shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
            <div className="text-sm font-semibold text-white">{option.label}</div>
            <div className="mt-2 text-sm leading-6 text-white/60">
              {option.description}
            </div>
          </div>
        </label>
      ))}
    </div>
  );
}

function NightCheckboxes() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {NIGHT_OPTIONS.map((night) => (
        <label
          key={night}
          className="group block cursor-pointer rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-emerald-500/30 hover:bg-white/[0.06]"
        >
          <input
            type="checkbox"
            name="preferredNights"
            value={night}
            className="peer sr-only"
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm font-semibold text-white transition peer-checked:border-emerald-400/50 peer-checked:bg-emerald-500/10 peer-checked:text-emerald-100 peer-checked:shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
            {night}
          </div>
        </label>
      ))}
    </div>
  );
}

export default async function TeamJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ joinSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { joinSlug } = await params;
  const filters = await searchParams;

  const team = await prisma.team.findFirst({
    where: {
      joinSlug,
      teamMode: "MANAGED",
    },
    select: {
      id: true,
      name: true,
      isRecruiting: true,
      league: {
        select: {
          name: true,
          season: true,
          venueName: true,
          dayOfWeek: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const savedMessage = getSavedMessage(filters.saved);
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  return (
    <div className="min-h-screen bg-[#07130f] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <div className="px-6 py-8 lg:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Join this team
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {team.name}
            </h1>

            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Register your interest as an individual player and the organiser will
              review your details.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              {team.league?.name ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league.name}
                  {team.league.season ? ` · ${team.league.season}` : ""}
                </span>
              ) : null}

              {team.league?.dayOfWeek ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league.dayOfWeek}
                </span>
              ) : null}

              {team.league?.venueName ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league.venueName}
                </span>
              ) : null}

              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  team.isRecruiting
                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                    : "border-red-400/20 bg-red-500/10 text-red-100"
                }`}
              >
                {team.isRecruiting ? "Recruiting now" : "Recruitment paused"}
              </span>
            </div>
          </div>
        </section>

        {savedMessage ? (
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            {savedMessage}
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            {errorMessage}
          </section>
        ) : null}

        {!team.isRecruiting ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <p className="text-sm text-white/65">
              This team is not currently recruiting players.
            </p>
            <div className="mt-4">
              <Link
                href="/leagues"
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
              >
                Back to leagues
              </Link>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <form action={submitTeamJoinProspectAction} className="space-y-8">
              <input type="hidden" name="joinSlug" value={joinSlug} />

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="firstName" className="text-sm text-white/60">
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="lastName" className="text-sm text-white/60">
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm text-white/60">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm text-white/60">
                    Mobile
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="text"
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Age band
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    This helps organisers understand the likely squad fit.
                  </p>
                </div>
                <OptionCards name="ageBand" options={AGE_BAND_OPTIONS} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Preferred position
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    Choose the role that suits you best.
                  </p>
                </div>
                <OptionCards name="preferredPositions" options={POSITION_OPTIONS} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Experience level
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    Pick the option that feels closest to your level.
                  </p>
                </div>
                <OptionCards name="experienceSummary" options={EXPERIENCE_OPTIONS} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Availability
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    Tell the organiser how often you can usually play.
                  </p>
                </div>
                <OptionCards name="availabilityLevel" options={AVAILABILITY_OPTIONS} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Preferred nights
                  </h2>
                  <p className="mt-1 text-sm text-white/60">
                    Select as many nights as work for you.
                  </p>
                </div>
                <NightCheckboxes />
              </div>

              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm text-white/60">
                  Anything else
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  placeholder="Anything useful for the organiser to know"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Register interest
                </button>

                <Link
                  href="/leagues"
                  className="inline-flex items-center rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  Back
                </Link>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
