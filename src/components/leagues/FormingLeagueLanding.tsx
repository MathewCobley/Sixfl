import Image from "next/image";
import { notFound } from "next/navigation";

import { createLeagueInterestLeadAction } from "@/app/(public)/leagues/[slug]/actions";
import { getHomepageLeagues } from "@/lib/leagues/homepage-leagues";
import { prisma } from "@/lib/prisma";

function formatDay(value?: string | null) {
  if (!value || value === "ANY") return "Night TBC";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatLeagueType(value?: string | null) {
  if (value === "MENS") return "Mens";
  if (value === "WOMENS") return "Womens";
  if (value === "YOUTH") return "Youth";
  return value || "6-a-side";
}

function formatDate(value?: Date | null) {
  if (!value) return "To be confirmed";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatFee(value?: number | null) {
  if (value === null || value === undefined) return "To be confirmed";
  const pounds = value / 100;
  return `£${Number.isInteger(pounds) ? pounds.toFixed(0) : pounds.toFixed(2)} per team`;
}

function normaliseAssetUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `/${trimmed}`;
}

export default async function FormingLeagueLanding({ slug }: { slug: string }) {
  const [league, homepageLeagues] = await Promise.all([
    prisma.league.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        season: true,
        area: true,
        dayOfWeek: true,
        leagueType: true,
        venueName: true,
        kickoffInfo: true,
        format: true,
        surface: true,
        description: true,
        heroImageUrl: true,
        badgeUrl: true,
        ctaText: true,
      },
    }),
    getHomepageLeagues({ includeHidden: true }),
  ]);

  if (!league) notFound();

  const homepageLeague = homepageLeagues.find((item) => item.id === league.id);
  const teamCount = homepageLeague?.teamCount ?? 0;
  const targetTeamCount = homepageLeague?.targetTeamCount ?? null;
  const proposedStartDate = homepageLeague?.proposedStartDate ?? null;
  const feePence = homepageLeague?.costPerTeamPerMatchPence ?? null;
  const stage = homepageLeague?.homepageStage === "PLANNED" ? "PLANNED" : "FORMING";

  const area = league.area?.trim() || league.venueName?.trim() || league.name;
  const venue = league.venueName?.trim() || "Venue to be confirmed";
  const day = formatDay(league.dayOfWeek);
  const leagueType = formatLeagueType(league.leagueType);
  const badgeUrl = normaliseAssetUrl(league.badgeUrl) || "/sixfl-badge.png";
  const heroImageUrl = normaliseAssetUrl(league.heroImageUrl);
  const headline = `${area} 6 a side football league`;
  const stageLabel = stage === "PLANNED" ? "Coming soon" : "Forming now";
  const teamTargetText = targetTeamCount
    ? `Target ${targetTeamCount} team${targetTeamCount === 1 ? "" : "s"}`
    : "More teams welcome";
  const intro =
    league.description?.trim() ||
    `A new ${day.toLowerCase()} SIXFL league is forming in ${area}. Full teams and individual players can register their interest now.`;

  const details = [
    ["Match night", day],
    ["Venue", venue],
    ["League type", leagueType],
    ["Planned start", formatDate(proposedStartDate)],
    ["Team fee", formatFee(feePence)],
    ["Kick-offs", league.kickoffInfo?.trim() || "To be confirmed"],
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="relative isolate overflow-hidden border-b border-white/10">
        {heroImageUrl ? (
          <div className="absolute inset-0">
            <Image
              src={heroImageUrl}
              alt=""
              fill
              priority
              className="object-cover object-center"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/80" />
          </div>
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_8%,rgba(16,185,129,0.22),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_24%)]" />

        <div className="relative mx-auto max-w-[1400px] px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
          <div className="rounded-3xl border border-emerald-400/15 bg-black/45 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-sm sm:p-8 lg:p-10">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200">
                    {area} • {day} • {leagueType}
                  </span>
                  <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-sky-100">
                    {stageLabel}
                  </span>
                </div>

                <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-center">
                  <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-emerald-400/20 bg-black/45 p-3 sm:h-32 sm:w-32">
                    <Image
                      src={badgeUrl}
                      alt={`${league.name} badge`}
                      fill
                      sizes="128px"
                      className="object-contain p-3"
                      unoptimized
                    />
                  </div>
                  <div>
                    {league.season ? (
                      <p className="text-sm font-semibold text-white/50">{league.season}</p>
                    ) : null}
                    <h1 className="mt-1 max-w-4xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                      {headline}
                    </h1>
                    {league.name !== headline ? (
                      <p className="mt-3 text-lg font-bold text-emerald-300 sm:text-xl">{league.name}</p>
                    ) : null}
                  </div>
                </div>

                <p className="mt-6 max-w-3xl text-base leading-7 text-white/75 sm:text-lg">
                  {intro}
                </p>

                <div className="mt-7 flex flex-wrap gap-3 text-sm text-white/75">
                  {[
                    "Teams forming now",
                    "Qualified referees",
                    "Properly organised weekly football",
                  ].map((item) => (
                    <span key={item} className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2">
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href="#register"
                    className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-400 px-6 text-sm font-black text-black transition hover:bg-emerald-300"
                  >
                    Register your interest
                  </a>
                  <a
                    href="#details"
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-bold text-white transition hover:bg-white/[0.08]"
                  >
                    League details
                  </a>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-5 sm:col-span-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300">Teams joined</p>
                  <div className="mt-2 flex items-end justify-between gap-4">
                    <div className="text-5xl font-black tracking-tight text-white">{teamCount}</div>
                    <div className="pb-1 text-right text-sm text-white/55">{teamTargetText}</div>
                  </div>
                  {targetTeamCount ? (
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${Math.min(100, Math.round((teamCount / targetTeamCount) * 100))}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Match night</p>
                  <p className="mt-2 text-2xl font-black text-white">{day}</p>
                  <p className="mt-1 text-sm text-white/50">{venue}</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">Planned start</p>
                  <p className="mt-2 text-xl font-black text-white">{formatDate(proposedStartDate)}</p>
                  <p className="mt-1 text-sm text-white/50">Subject to final team numbers</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="details" className="mx-auto max-w-[1400px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">League forming</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                Join before the first match night
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/68 sm:text-base">
                We are currently building the league. Register a full team, put a team together, or join as an individual player and SIXFL will contact you with the next steps as the launch group fills.
              </p>

              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {details.map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{label}</p>
                    <p className="mt-2 font-semibold text-white/85">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-200">What happens next?</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  ["1", "Register", "Tell us whether you have a team or are looking to join one."],
                  ["2", "We contact you", "SIXFL confirms the league details and what we need from you."],
                  ["3", "League launches", "Once the launch group is ready, we confirm the first match night."],
                ].map(([number, title, copy]) => (
                  <div key={number} className="rounded-2xl border border-white/10 bg-black/25 p-5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-300 text-sm font-black text-black">{number}</div>
                    <h3 className="mt-4 font-bold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/58">{copy}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="register" className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Join this league</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight">Register your interest</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Full teams, people putting a team together and individual players are all welcome.
            </p>

            <form action={createLeagueInterestLeadAction} className="mt-6 space-y-4">
              <input type="hidden" name="leagueId" value={league.id} />
              <input type="hidden" name="area" value={league.area || league.venueName || ""} />
              <input type="hidden" name="source" value={`forming-league-page-${league.slug}`} />

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/80">What are you looking for?</span>
                <select
                  name="interestType"
                  defaultValue="TEAM"
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                >
                  <option value="TEAM">I have / am putting together a team</option>
                  <option value="PLAYER">I am an individual looking for a team</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/80">Your name</span>
                <input name="contactName" type="text" required className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/80">Email</span>
                <input name="email" type="email" required className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/80">Phone</span>
                <input name="phone" type="text" className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/80">Team name (if applicable)</span>
                <input name="teamName" type="text" className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-white/80">Message</span>
                <textarea name="message" rows={4} className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-emerald-400/50" />
              </label>

              <button type="submit" className="w-full rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-black text-black transition hover:bg-emerald-300">
                {league.ctaText?.trim() || "Register your interest"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
