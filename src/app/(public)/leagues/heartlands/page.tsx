// ========================================
// File: src/app/(public)/leagues/heartlands/page.tsx
// ========================================

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createHeartlandsInterestLeadAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "North Yorkshire Heartlands 6-a-side League | SIXFL",
  description:
    "Join the new North Yorkshire Heartlands Wednesday 6-a-side league at Queen Mary's School near Thirsk. Teams and individual players can register now.",
};

type SearchParams = {
  type?: string;
};

function formatPreferredNight(value?: string | null) {
  if (!value) return "Wednesday";
  if (value === "ANY") return "Wednesday";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function normaliseImage(value?: string | null) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  ) {
    return trimmed;
  }

  return `/${trimmed}`;
}

async function getHeartlandsLeague() {
  return prisma.league.findFirst({
    where: {
      OR: [
        { slug: { contains: "heartlands", mode: "insensitive" } },
        { name: { contains: "heartlands", mode: "insensitive" } },
        { area: { contains: "heartlands", mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      season: true,
      area: true,
      dayOfWeek: true,
      venueName: true,
      kickoffInfo: true,
      format: true,
      surface: true,
      heroImageUrl: true,
      badgeUrl: true,
      ctaText: true,
    },
  });
}

export default async function HeartlandsLaunchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [league, params] = await Promise.all([
    getHeartlandsLeague(),
    searchParams,
  ]);

  if (!league) notFound();

  const selectedType =
    params.type?.trim().toLowerCase() === "player" ? "PLAYER" : "TEAM";
  const nightLabel = formatPreferredNight(league.dayOfWeek);
  const venueLabel = league.venueName || "Queen Mary's School, near Thirsk";
  const heroImage =
    normaliseImage(league.heroImageUrl) ||
    "/venues/north-yorkshire-heartlands-hero.jpg";
  const badgeImage = normaliseImage(league.badgeUrl) || "/sixfl-badge.png";
  const intro =
    "A new SIXFL league for teams and individual players across Richmond, Thirsk, Catterick, Bedale and the surrounding area. Proper weekly fixtures, qualified referees and a league that is easy to follow.";

  const details = [
    { label: "Match night", value: nightLabel },
    { label: "Time", value: league.kickoffInfo || "7pm–9pm" },
    { label: "Venue", value: venueLabel },
    { label: "Team fee", value: "£40 per week" },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0">
          <Image
            src={heroImage}
            alt={venueLabel}
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/70" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/55 to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.24),transparent_38%)]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="max-w-4xl rounded-[2rem] border border-white/10 bg-black/40 p-6 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-sm sm:p-9 lg:p-11">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-emerald-400/25 bg-black/60 p-3 shadow-2xl sm:h-28 sm:w-28">
                <Image
                  src={badgeImage}
                  alt={`${league.name} badge`}
                  fill
                  sizes="112px"
                  className="object-contain p-2"
                  unoptimized
                />
              </div>

              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200">
                    Founding season
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white/80">
                    Teams and players registering
                  </span>
                </div>
                <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-emerald-300">
                  Richmond • Thirsk • Catterick • Bedale
                </p>
              </div>
            </div>

            <h1 className="mt-7 max-w-3xl text-4xl font-black leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl">
              {league.name}
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-8 text-white/75 sm:text-lg">
              {intro}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href="/leagues/heartlands?type=team#register"
                className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-500 px-6 text-sm font-extrabold text-black transition hover:bg-emerald-400"
              >
                Enter a team
              </a>
              <a
                href="/leagues/heartlands?type=player#register"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 bg-white/10 px-6 text-sm font-extrabold text-white transition hover:bg-white/15"
              >
                Join as a player
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                {detail.label}
              </div>
              <div className="mt-2 text-lg font-bold text-white">
                {detail.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)] lg:items-start">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                6-a-side. Done properly.
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">
                A better local league experience.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/65">
                Built for teams who want reliable weekly football without the usual confusion. Fixtures, results, tables and match-night information are kept together throughout the season.
              </p>

              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                {[
                  ["Reliable", "Fixed weekly fixtures and clear kick-off information."],
                  ["Competitive", "A proper table, results and match-night structure."],
                  ["Professional", "Qualified referees and organised league management."],
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="font-bold text-emerald-300">{title}</div>
                    <p className="mt-2 text-sm leading-6 text-white/60">{copy}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/[0.06] p-6 sm:p-8">
              <h2 className="text-2xl font-black">The essentials</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  league.format || "6-a-side football",
                  league.surface || "3G playing surface",
                  "Wednesday evenings, 7pm–9pm",
                  "Live fixtures, results and league table",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white/80"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside
            id="register"
            className="scroll-mt-24 rounded-[2rem] border border-emerald-400/25 bg-white/[0.06] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.4)] sm:p-8"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
              Join the league
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">
              Register now
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              No payment is taken now. Register a full team or join as an individual player.
            </p>

            <form
              action={createHeartlandsInterestLeadAction}
              className="mt-6 space-y-5"
            >
              <input type="hidden" name="leagueId" value={league.id} />
              <input
                type="hidden"
                name="area"
                value={league.area || "North Yorkshire Heartlands"}
              />
              <input
                type="hidden"
                name="source"
                value="heartlands-launch-page"
              />

              <fieldset>
                <legend className="mb-3 text-sm font-semibold text-white/85">
                  What are you registering?
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-bold text-white ${
                      selectedType === "TEAM"
                        ? "border-emerald-400/30 bg-emerald-500/10"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <input
                      type="radio"
                      name="interestType"
                      value="TEAM"
                      defaultChecked={selectedType === "TEAM"}
                      required
                      className="accent-emerald-500"
                    />
                    I have a team
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm font-bold text-white ${
                      selectedType === "PLAYER"
                        ? "border-emerald-400/30 bg-emerald-500/10"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <input
                      type="radio"
                      name="interestType"
                      value="PLAYER"
                      defaultChecked={selectedType === "PLAYER"}
                      required
                      className="accent-emerald-500"
                    />
                    I am a player
                  </label>
                </div>
              </fieldset>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/85">Your name</span>
                <input
                  name="contactName"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Your full name"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/85">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/85">Mobile</span>
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Optional"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/85">
                  Team name
                </span>
                <input
                  name="teamName"
                  type="text"
                  placeholder="Leave blank if joining as a player"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/85">
                  Anything else?
                </span>
                <textarea
                  name="message"
                  rows={3}
                  placeholder="Optional"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-emerald-400"
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 px-5 py-3.5 text-sm font-extrabold text-black transition hover:bg-emerald-400"
              >
                {league.ctaText?.trim() || "Register for Heartlands"}
              </button>
            </form>

            <p className="mt-4 text-xs leading-5 text-white/45">
              We will use these details only to contact you about this league.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
