// ========================================
// File: src/app/teams/join/[joinSlug]/page.tsx
// ========================================

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
    <div className="min-h-screen bg-[#07130f] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Join this team
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {team.name}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/75">
            {team.league?.name ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {team.league.name}
                {team.league.season ? ` · ${team.league.season}` : ""}
              </span>
            ) : null}
            {team.league?.dayOfWeek ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {team.league.dayOfWeek}
              </span>
            ) : null}
            {team.league?.venueName ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {team.league.venueName}
              </span>
            ) : null}
            <span className={`rounded-full border px-3 py-1 ${team.isRecruiting ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-red-400/20 bg-red-500/10 text-red-100"}`}>
              {team.isRecruiting ? "Recruiting now" : "Recruitment paused"}
            </span>
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
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/65">
            This team is not currently recruiting players.
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <form action={submitTeamJoinProspectAction} className="grid gap-5 sm:grid-cols-2">
              <input type="hidden" name="joinSlug" value={joinSlug} />

              <label className="space-y-2 text-sm text-white/70">
                <span>First name</span>
                <input name="firstName" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
              </label>

              <label className="space-y-2 text-sm text-white/70">
                <span>Last name</span>
                <input name="lastName" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
              </label>

              <label className="space-y-2 text-sm text-white/70">
                <span>Email</span>
                <input name="email" type="email" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
              </label>

              <label className="space-y-2 text-sm text-white/70">
                <span>Mobile</span>
                <input name="phone" type="text" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60" />
              </label>

              <label className="space-y-2 text-sm text-white/70">
                <span>Age band</span>
                <select name="ageBand" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60">
                  <option value="">Select</option>
                  <option value="16-18">16–18</option>
                  <option value="18-25">18–25</option>
                  <option value="25-35">25–35</option>
                  <option value="35+">35 and over</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-white/70">
                <span>Preferred position</span>
                <select name="preferredPositions" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60">
                  <option value="">Select</option>
                  <option value="Goalkeeper">Goalkeeper</option>
                  <option value="Outfield">Outfield</option>
                  <option value="Both">Both</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-white/70 sm:col-span-2">
                <span>Experience level</span>
                <select name="experienceSummary" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60">
                  <option value="">Select</option>
                  <option value="New to football">New to football</option>
                  <option value="Casual player">Casual player</option>
                  <option value="Can play a bit">Can play a bit</option>
                  <option value="Good player">Good player</option>
                  <option value="Top baller">Top baller</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-white/70 sm:col-span-2">
                <span>Availability</span>
                <select name="availabilityLevel" className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500/60">
                  <option value="">Select</option>
                  <option value="Available every week">Available every week</option>
                  <option value="Usually available">Usually available</option>
                  <option value="Sometimes available">Sometimes available</option>
                  <option value="Rarely available">Rarely available</option>
                  <option value="Not sure yet">Not sure yet</option>
                </select>
              </label>

              <fieldset className="space-y-3 sm:col-span-2">
                <legend className="text-sm text-white/70">Preferred nights</legend>
                <div className="flex flex-wrap gap-3 text-sm text-white/80">
                  {[
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Any",
                  ].map((night) => (
                    <label key={night} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                      <input type="checkbox" name="preferredNights" value={night} />
                      <span>{night}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="space-y-2 text-sm text-white/70 sm:col-span-2">
                <span>Anything else</span>
                <textarea name="notes" rows={4} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-white outline-none transition focus:border-emerald-500/60" />
              </label>

              <div className="sm:col-span-2">
                <button type="submit" className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
                  Register interest
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
