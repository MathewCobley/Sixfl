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
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
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
            <form action={submitTeamJoinProspectAction} className="space-y-5">
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

              <div className="space-y-2">
                <label htmlFor="preferredPositions" className="text-sm text-white/60">
                  Preferred positions
                </label>
                <input
                  id="preferredPositions"
                  name="preferredPositions"
                  type="text"
                  placeholder="Defender, pivot, winger"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="experienceSummary" className="text-sm text-white/60">
                  Playing experience
                </label>
                <textarea
                  id="experienceSummary"
                  name="experienceSummary"
                  rows={4}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="availabilitySummary" className="text-sm text-white/60">
                  Availability
                </label>
                <textarea
                  id="availabilitySummary"
                  name="availabilitySummary"
                  rows={4}
                  placeholder="Usually available Tuesdays, can play most weeks"
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="notes" className="text-sm text-white/60">
                  Anything else
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
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