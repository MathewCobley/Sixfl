// ========================================
// File: src/app/leagues/[slug]/page.tsx
// ========================================

import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createLeagueInterestLeadAction } from "./actions";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function LeagueLandingPage({ params }: PageProps) {
  const { slug } = await params;

  const league = await prisma.league.findFirst({
    where: {
      slug,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!league) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* HERO */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 min-h-[72vh]">
        <div className="absolute inset-0">
          <Image
            src="/venues/rossett_dark_trendy.jpg"
            alt="Rossett football pitch"
            fill
            priority
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/70" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/55 to-black" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_35%)]" />
        </div>

        <div className="relative mx-auto flex min-h-[72vh] max-w-6xl items-center px-6 py-16 sm:px-10 sm:py-24 lg:py-28">
          <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6 backdrop-blur-[2px] sm:p-8 lg:p-10">
            <div className="max-w-4xl">
              <div className="flex flex-col gap-6 sm:gap-8 lg:flex-row lg:items-start lg:gap-8">
                {/* LEAGUE BADGE */}
                <div className="shrink-0">
                  <div className="relative inline-flex rounded-3xl border border-white/10 bg-black/35 p-3 backdrop-blur-md">
                    <div className="absolute inset-0 rounded-3xl bg-emerald-500/10 blur-2xl" />
                    <Image
                      src="/leagues/harrogate-tuesday-mens-rossett-sports.png"
                      alt="Rossett Tuesday League badge"
                      width={180}
                      height={180}
                      priority
                      className="relative h-[110px] w-auto sm:h-[135px] lg:h-[150px] drop-shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
                    />
                  </div>
                </div>

                {/* TEXT BLOCK */}
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">
                    SIXFL League Launch
                  </p>

                  <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                    Rossett Men&apos;s
                    <br />
                    Tuesday League
                  </h1>

                  <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
                    6-a-side football. Done properly. Register your interest now
                    for a properly run men&apos;s Tuesday night league at
                    Rossett.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/80">
                    <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
                      Fixed weekly fixtures
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
                      Qualified referees
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-4 py-2 backdrop-blur">
                      Live tables &amp; stats
                    </span>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-4">
                    <a
                      href="#register"
                      className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-black transition hover:bg-emerald-400"
                    >
                      Register your interest
                    </a>

                    <a
                      href="#details"
                      className="rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                    >
                      Learn more
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DETAILS + FORM */}
      <section
        id="details"
        className="mx-auto max-w-6xl border-x border-b border-white/10 bg-[#05070a]"
      >
        <div className="grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-16">
          {/* LEFT */}
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                League Details
              </p>

              <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
                A better way to play local 6-a-side football
              </h2>

              <p className="mt-4 max-w-2xl text-white/70">
                This league is designed for teams who want consistency, quality,
                and a better match-night experience. No chaos. No mess. Just
                properly organised football.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-sm font-semibold text-emerald-400">
                    Format
                  </div>
                  <div className="mt-1 text-white/85">Men&apos;s 6-a-side</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-sm font-semibold text-emerald-400">
                    Night
                  </div>
                  <div className="mt-1 text-white/85">Tuesday</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-sm font-semibold text-emerald-400">
                    Venue
                  </div>
                  <div className="mt-1 text-white/85">Rossett</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-sm font-semibold text-emerald-400">
                    League
                  </div>
                  <div className="mt-1 text-white/85">{league.name}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-emerald-400">
                  Reliable
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Fixed weekly match nights and properly managed league
                  operations.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-emerald-400">
                  Competitive
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Quality local football with structure, standards and a proper
                  league feel.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-emerald-400">
                  Professional
                </div>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Referees, fixtures, tables and stats handled the right way.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT / FORM */}
          <div id="register">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
                Join This League
              </p>

              <h2 className="mt-3 text-2xl font-bold">Register your interest</h2>

              <p className="mt-3 text-white/70">
                Tell us a little about your team and we&apos;ll be in touch about
                the Rossett Tuesday launch.
              </p>

              <form
                action={createLeagueInterestLeadAction}
                className="mt-6 space-y-4"
              >
                <input type="hidden" name="leagueId" value={league.id} />
                <input type="hidden" name="area" value="Rossett" />
                <input
                  type="hidden"
                  name="source"
                  value="flyer-rossett-mens-tuesday"
                />

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Your name
                  </label>
                  <input
                    name="contactName"
                    type="text"
                    required
                    placeholder="Your full name"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Email
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Phone
                  </label>
                  <input
                    name="phone"
                    type="text"
                    placeholder="Optional"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Team name
                  </label>
                  <input
                    name="teamName"
                    type="text"
                    placeholder="Optional"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/85">
                    Message
                  </label>
                  <textarea
                    name="message"
                    rows={4}
                    placeholder="Anything you'd like to tell us"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-black transition hover:bg-emerald-400"
                >
                  Register your interest
                </button>
              </form>

              <p className="mt-4 text-sm text-white/50">
                We&apos;ll use these details to contact you about this specific
                league.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}