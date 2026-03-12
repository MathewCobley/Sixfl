// ========================================
// File: src/app/match-rules/page.tsx
// ========================================

import Link from "next/link";

export default function MatchRulesPage() {
  return (
    <div className="space-y-10">
      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL MATCH RULES
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
            Match Rules
          </h1>

          <p className="mt-2 text-sm text-white/50">
            Version 1.0 — March 2026
          </p>

          <p className="mt-4 text-white/70 md:text-lg">
            These rules outline how SIXFL matches are played. They apply to all
            SIXFL competitions unless otherwise stated by the league.
          </p>
        </div>
      </section>

      <div className="space-y-6">
        <Rule title="Referee Decisions">
          Decisions of the referee regarding facts connected with play are final.
        </Rule>

        <Rule title="Match Duration">
          Matches are typically played between 30–40 minutes in duration.
          Competition formats may allow games to be played without a half-time
          interval or requirement to change ends.
        </Rule>

        <Rule title="Start of Play">
          The choice of ends is decided by the toss of a coin. The losing team
          takes the kick-off.
        </Rule>

        <Rule title="Kick-Off">
          A kick-off is used to start the match, restart play after a goal and
          start the second half. A goal may be scored directly from a kick-off
          or corner kick.
        </Rule>

        <Rule title="Ball In and Out of Play">
          The ball is out of play when it has wholly crossed the goal line or
          touchline, or when play has been stopped by the referee. The ball is
          in play at all other times, including rebounds from the goalpost or
          crossbar.
        </Rule>

        <Rule title="Scoring">
          A goal is scored when the whole of the ball passes over the goal line.
          The team scoring the greater number of goals wins the match.
        </Rule>

        <Rule title="Offside and Height Rules">
          There is no offside rule and no overhead height restriction.
        </Rule>

        <Rule title="Free Kicks">
          All free kicks are direct and are awarded to the opposing team for
          offences in accordance with the rules of play. Opponents must stand at
          least five yards from the ball until it is in play.
        </Rule>

        <Rule title="Penalty Area">
          A penalty kick may be awarded if a defender enters the penalty area or
          if the goalkeeper leaves the penalty area in violation of the rules.
          If an attacking player enters the penalty area, the referee may award
          possession to the goalkeeper.
        </Rule>

        <Rule title="Kick-Ins">
          Kick-ins replace throw-ins when the ball leaves the pitch. A goal
          cannot be scored directly from a kick-in or from a goalkeeper restart.
          A direct backpass to the goalkeeper is not permitted from a kick-in.
        </Rule>

        <Rule title="Goalkeeper Rules">
          Goalkeepers must restart play by throwing the ball underarm or overarm.
          Goalkeepers may save or stop the ball with their feet, but may not
          kick the ball out from their hands. If a goalkeeper kicks the ball
          from their hands, a free kick may be awarded to the opposing team.
        </Rule>

        <Rule title="Guest Players">
          Teams may use a maximum of two guest players per match.

          Guest players may play a maximum of three matches for the same team
          during a season. After this point, the player must be registered as a
          permanent player for that team.

          Guest players must be agreed with the opposing captain and referee
          before kick-off.

          Guest players may not participate in playoff or final matches unless
          registered with the team.

          Teams may not use guest players as substitutes during a match.
        </Rule>

        <Rule title="Discipline and Sin Bin Rule">
          Referees may use temporary suspensions (sin bins) for cautionable
          offences.

          A player shown a blue card is temporarily suspended from play.

          A second blue card in the same match results in permanent exclusion
          from the match.

          A red card results in immediate dismissal from the match.

          Serious disciplinary incidents may be reported to the relevant County
          FA.
        </Rule>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <Link
          href="/league-rules"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Rules
        </Link>

        <Link
          href="/league-agreement"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View League Agreement
        </Link>

        <Link
          href="/referee-agreement"
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-white/80 transition hover:border-emerald-400/40 hover:text-white"
        >
          View Referee Agreement
        </Link>
      </div>
    </div>
  );
}

function Rule({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="mt-2 leading-7 whitespace-pre-line text-white/75">
        {children}
      </p>
    </div>
  );
}