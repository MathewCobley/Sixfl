import RefereeAppShell from "@/components/referee/RefereeAppShell";
import { requireReferee } from "@/lib/admin";
import {
  LEAGUE_RULES_EFFECTIVE_DATE,
  LEAGUE_RULES_VERSION,
  leagueRuleSections,
} from "@/lib/league-rules";
import { PLAYER_LIMIT_RULES_PUBLICATION_NOTE } from "@/lib/matchday-player-limit-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function RuleCard({
  title,
  points,
  open = false,
}: {
  title: string;
  points: string[];
  open?: boolean;
}) {
  return (
    <details open={open || undefined} className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-white/[0.03]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-black text-white [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-lg font-normal text-white/35">⌄</span>
      </summary>
      <div className="space-y-2 border-t border-white/[0.07] p-3">
        {points.map((point) => (
          <div key={point} className="flex gap-2.5 rounded-xl bg-black/20 px-3 py-2.5 text-sm leading-5 text-white/65">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
            <span>{point}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function RefereeLeagueRulesPage() {
  await requireReferee();

  return (
    <RefereeAppShell active="more" title="League Rules">
      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <h1 className="text-lg font-black text-white">SIXFL League Rules</h1>
        <p className="mt-1 text-xs text-white/45">
          {LEAGUE_RULES_VERSION} · Effective {LEAGUE_RULES_EFFECTIVE_DATE}
        </p>
        <p className="mt-2 text-sm leading-5 text-white/60">
          Competition, payment, conduct and fixture rules that apply across SIXFL.
        </p>
        <p className="mt-2 text-xs leading-5 text-white/45">{PLAYER_LIMIT_RULES_PUBLICATION_NOTE}</p>
      </section>

      <section className="space-y-2">
        {leagueRuleSections.map((section, index) => (
          <RuleCard key={section.title} title={section.title} points={section.points} open={index === 0} />
        ))}
      </section>
    </RefereeAppShell>
  );
}
