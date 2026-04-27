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

const AGE_BANDS = ["16-18", "18-25", "25-35", "35+"] as const;
const POSITIONS = ["Goalkeeper", "Outfield", "Both"] as const;
const EXPERIENCE = [
  "New to football",
  "Casual player",
  "Can play a bit",
  "Good player",
  "Top baller",
] as const;
const AVAILABILITY = [
  "Available every week",
  "Usually available",
  "Sometimes available",
  "Rarely available",
  "Not sure yet",
] as const;
const NIGHTS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Any",
] as const;

function getSavedMessage(saved?: string) {
  if (saved === "1") {
    return "Thanks — your details have been saved and the organiser has been notified.";
  }

  if (saved === "details-completed") {
    return "Thanks — your prospect details have been updated and the organiser has been notified.";
  }

  if (saved === "already-registered") {
    return "You have already registered interest for this team.";
  }

  return null;
}

function RadioCards({
  name,
  options,
}: {
  name: string;
  options: readonly string[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((option) => (
        <label
          key={option}
          className="group block cursor-pointer rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:border-emerald-500/30 hover:bg-white/[0.06]"
        >
          <input type="radio" name={name} value={option} className="peer sr-only" />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4 text-sm font-semibold text-white transition peer-checked:border-emerald-400/50 peer-checked:bg-emerald-500/10 peer-checked:text-emerald-100 peer-checked:shadow-[0_0_0_1px_rgba(16,185,129,0.12)]">
            {option}
          </div>
        </label>
      ))}
    </div>
  );
}

function NightCheckboxes() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {NIGHTS.map((night) => (
        <label
          key={night}
          className="group block cursor-pointer rounded-2xl border border-white/10 bg-black/20 p-3 transition hover:border-emerald-500/30 hover:bg-white/[0.06]"
        >
          <input type="checkbox" name="preferredNights" value={night} className="peer sr-only" />
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
    where: { joinSlug, teamMode: "MANAGED" },
    select: {
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
        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <div className="px-6 py-8 lg:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Join this team
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {team.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Register your interest as an individual player and the organiser will review your details.
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
            <p className="text-sm text-white/65">This team is not currently recruiting players.</p>
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
                  <h2 className="text-base font-semibold text-white">Age band</h2>
                  <p className="mt-1 text-sm text-white/60">This helps organisers understand the likely squad fit.</p>
                </div>
                <RadioCards name="ageBand" options={AGE_BANDS} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Preferred position</h2>
                  <p className="mt-1 text-sm text-white/60">Choose the role that suits you best.</p>
                </div>
                <RadioCards name="preferredPositions" options={POSITIONS} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Experience level</h2>
                  <p className="mt-1 text-sm text-white/60">Pick the option that feels closest to your level.</p>
                </div>
                <RadioCards name="experienceSummary" options={EXPERIENCE} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Availability</h2>
                  <p className="mt-1 text-sm text-white/60">Tell the organiser how often you can usually play.</p>
                </div>
                <RadioCards name="availabilityLevel" options={AVAILABILITY} />
              </div>

              <div className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Preferred nights</h2>
                  <p className="mt-1 text-sm text-white/60">Select as many nights as work for you.</p>
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
