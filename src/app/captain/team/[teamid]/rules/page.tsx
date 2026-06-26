// ========================================
// File: src/app/captain/team/[teamid]/rules/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Match Rules | SIXFL",
};

const ruleSections = [
  {
    title: "Core format",
    items: [
      "Standard SIXFL matches are 6-a-side: five outfield players plus a goalkeeper, unless SIXFL confirms a venue-specific format.",
      "Teams should be ready to start at the published kick-off time.",
      "The referee controls the match clock, stoppages, restarts and any venue-specific instructions on the night.",
      "Captains are responsible for making sure their players understand the rules and behave properly.",
    ],
  },
  {
    title: "Kick-ins and ball out of play",
    items: [
      "Kick-ins replace throw-ins when the ball goes out over the touchline.",
      "The ball should be stationary on or just behind the touchline before the kick-in is taken.",
      "Opponents should give space for the kick-in. The referee will manage the distance on the night.",
      "A goal cannot be scored directly from a kick-in unless another player touches the ball first.",
      "Corners and goal kicks are awarded when the ball crosses the goal line in the usual way.",
    ],
  },
  {
    title: "Goalkeepers",
    items: [
      "Goalkeepers may handle the ball inside their own area only.",
      "Normal pass-back rules apply where the goalkeeper receives a deliberate pass from a team-mate.",
      "Goalkeepers should release the ball promptly and should not delay the game.",
      "The referee will manage goalkeeper restarts and any venue-specific goalkeeper rules.",
    ],
  },
  {
    title: "Substitutions",
    items: [
      "Rolling substitutions are allowed where the venue setup permits it.",
      "The player coming off should leave the pitch before the replacement joins play.",
      "Substitutions should be made safely and without interfering with active play.",
      "The referee can stop or manage substitutions if they are delaying the game or causing confusion.",
    ],
  },
  {
    title: "Fouls and discipline",
    items: [
      "No slide tackles. Players should stay on their feet when challenging for the ball.",
      "Dangerous, reckless or aggressive play can lead to a free kick, penalty, sin-bin, sending off or further league action.",
      "Dissent, abusive language, threats or repeated poor conduct will not be accepted.",
      "Captains are expected to calm their own players and support the referee in keeping the game under control.",
    ],
  },
  {
    title: "Free kicks and penalties",
    items: [
      "Free kicks are awarded by the referee for fouls, handball, dangerous play, obstruction, dissent or other offences.",
      "The referee will decide whether a restart is direct or indirect where this matters.",
      "Opponents must retreat the required distance set by the referee.",
      "Penalties are awarded for offences inside the penalty area or where the referee decides a penalty is the correct restart.",
    ],
  },
  {
    title: "Results and disputes",
    items: [
      "The referee records or confirms the final score on the night where required.",
      "Captains should check the result promptly after the fixture.",
      "If something is wrong, raise it through the captain results or issue route rather than arguing informally.",
      "Referee decisions are final on the night. SIXFL can review admin issues afterwards but the match should not be replayed on the pitch.",
    ],
  },
  {
    title: "Venue rules",
    items: [
      "Venue rules always apply, including footwear, pitch access, equipment, parking and behaviour around the site.",
      "Some venues may have specific rules for pitch boundaries, goalkeeper areas, head height or restarts.",
      "SIXFL or the referee will explain any venue-specific rule before or during the match where needed.",
      "If a venue rule differs from this guide, the venue-specific instruction applies for that fixture.",
    ],
  },
];

function getRuleId(title: string) {
  return title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function CaptainRulesPage({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
          venueName: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="px-6 py-6 lg:px-8 lg:py-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            Match Rules
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            SIXFL playing rules
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/68 sm:text-base">
            The core playing rules for {team.name}. Venue-specific instructions may still apply on the night, and the referee manages the game on the pitch.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/captain/team/${team.id}`}
              className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              Back to dashboard
            </Link>
            <Link
              href={`/captain/team/${team.id}/guide`}
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-5 py-3 text-sm font-medium text-emerald-50 transition hover:bg-emerald-500/20"
            >
              Guide & terms
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ruleSections.map((section) => (
          <a
            key={section.title}
            href={`#${getRuleId(section.title)}`}
            className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 transition hover:bg-emerald-500/15"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/70">
              Rules
            </p>
            <p className="mt-2 text-sm font-semibold text-white">{section.title}</p>
          </a>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {ruleSections.map((section) => (
          <article
            key={section.title}
            id={getRuleId(section.title)}
            className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.04] p-5"
          >
            <h2 className="text-lg font-semibold text-white">{section.title}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-white/62">
              {section.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
        <h2 className="text-lg font-semibold text-white">Important</h2>
        <p className="mt-3 text-sm leading-6 text-amber-50/75">
          These are the standard SIXFL playing rules. If a league, venue or referee gives a specific instruction for a fixture, that instruction applies for that match.
        </p>
      </section>
    </div>
  );
}
