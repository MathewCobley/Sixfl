import Link from "next/link";

const rules = [
  {
    title: "1. Match Format",
    text: "Matches are played between two teams of six players including a goalkeeper. Teams may name a larger squad and make rolling substitutions during the match.",
  },
  {
    title: "2. Minimum Players",
    text: "A team must have a minimum of four players to start a match. If a team cannot field four players, the match may be awarded to the opposition.",
  },
  {
    title: "3. Match Duration",
    text: "Matches are typically played as two halves of equal length. Exact match duration may vary depending on venue scheduling and will be confirmed before the season begins.",
  },
  {
    title: "4. Substitutions",
    text: "Rolling substitutions are permitted throughout the match. Substitutions should take place from the designated substitution area.",
  },
  {
    title: "5. Equipment",
    text: "Players should wear appropriate football footwear suitable for the playing surface. Shin guards are strongly recommended.",
  },
  {
    title: "6. Referees",
    text: "Matches are officiated by referees appointed by the league. The referee’s decision on the field of play is final.",
  },
  {
    title: "7. Discipline",
    text: "Unsporting behaviour may result in disciplinary action including yellow or red cards. Players dismissed from a match may face suspension depending on the offence.",
  },
  {
    title: "8. Fixtures",
    text: "Fixtures are scheduled by SIXFL and shared with teams in advance. Teams are expected to attend their scheduled matches.",
  },
  {
    title: "9. Failure to Attend",
    text: "Teams that fail to attend a scheduled match without notice may forfeit the match and the result may be recorded as a loss.",
  },
  {
    title: "10. Weather and Cancellations",
    text: "If weather or pitch conditions make matches unsafe or unplayable, fixtures may be postponed and rescheduled.",
  },
  {
    title: "11. League Table",
    text: "League tables are based on standard points scoring: 3 points for a win, 1 point for a draw, and 0 points for a loss.",
  },
  {
    title: "12. League Authority",
    text: "SIXFL reserves the right to interpret and apply league rules where necessary in order to maintain fair competition and the smooth running of the league.",
  },
];

export default function LeagueRulesPage() {
  return (
    <div className="space-y-10">

      <section className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 md:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">
            SIXFL Rules
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
            League Rules
          </h1>

          <p className="mt-4 max-w-2xl text-base text-white/70 md:text-lg">
            These rules outline the basic structure and expectations for teams
            participating in SIXFL competitions. Our aim is to provide a fair,
            well-organised and enjoyable football experience for all players.
          </p>
        </div>
      </section>

      <section className="grid gap-4">
        {rules.map((rule) => (
          <div
            key={rule.title}
            className="rounded-2xl border border-white/10 bg-white/5 p-6"
          >
            <h2 className="text-lg font-bold text-white">{rule.title}</h2>
            <p className="mt-2 leading-7 text-white/75">{rule.text}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-8 md:px-8">
        <h2 className="text-2xl font-black text-white">
          Questions about the rules?
        </h2>

        <p className="mt-3 max-w-2xl text-white/75">
          If you have questions about league rules or match procedures, please
          contact SIXFL and we will be happy to help.
        </p>

        <div className="mt-6 flex flex-wrap gap-4">
          <a
            href="mailto:hello@sixfl.co.uk"
            className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-400"
          >
            Contact SIXFL
          </a>

          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            Register Your Team
          </Link>
        </div>
      </section>

    </div>
  );
}