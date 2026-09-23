import { PLAYER_LIMIT_RULES_PUBLICATION_NOTE } from "@/lib/matchday-player-limit-rules";
import Link from "next/link";

import RefereeAppShell from "@/components/referee/RefereeAppShell";
import { requireReferee } from "@/lib/admin";
import {
  MATCH_RULES_EFFECTIVE_DATE,
  MATCH_RULES_VERSION,
  matchRuleSections,
} from "@/lib/match-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const operatingGuideSections = [
  {
    title: "Before kick-off",
    points: [
      "Arrive early enough to check the pitch, goals, ball and teams before the first match.",
      "Start matches on time wherever possible. Short delays quickly affect the whole night.",
      "If a team is late, use sensible judgement and record any issue in the night notes.",
    ],
  },
  {
    title: "During the match",
    points: [
      "Keep decisions clear, calm and consistent. The league should feel organised, not casual.",
      "Manage dissent early. Warn players where appropriate and escalate repeated behaviour.",
      "Record anything serious straight away, including injuries, abandoned matches or major disputes.",
    ],
  },
  {
    title: "Scores and results",
    points: [
      "Enter the final score for each fixture as soon as the match ends.",
      "If a score is disputed, still enter what you believe is correct and add a note for SIXFL.",
      "Use the referee night page to keep all scores and cashup details together for that night.",
    ],
  },
  {
    title: "Cash and fees",
    points: [
      "Record any cash collected from teams on the night.",
      "The night cashup will show what is due to SIXFL or what SIXFL owes you after your referee fee.",
      "Submit the night once scores, notes and cash details are complete.",
    ],
  },
];

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

export default async function RefereeMatchRulesPage() {
  const { user, isAdminPreview } = await requireReferee();
  const refereeName = user.name || user.email || "this referee";

  return (
    <RefereeAppShell active="rules" title="Match rules">
      {isAdminPreview ? (
        <details className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
          <summary className="cursor-pointer font-bold">Admin preview · {refereeName}</summary>
          <Link
            href={`/admin/referees/${user.id}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${user.id}`)}`}
            className="mt-2 inline-flex min-h-11 items-center underline"
          >
            Switch back to admin
          </Link>
        </details>
      ) : null}

      <section className="rounded-[1.35rem] border border-emerald-400/20 bg-emerald-500/[0.07] p-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/75">
          Quick reference
        </p>
        <h1 className="mt-1 text-lg font-black text-white">SIXFL match guide</h1>
        <p className="mt-1 text-xs text-white/45">
          {MATCH_RULES_VERSION} · Effective {MATCH_RULES_EFFECTIVE_DATE}
        </p>
        <p className="mt-2 text-sm leading-5 text-white/60">
          Use this during a night when you need a quick ruling or reminder.
        </p>
        <p className="mt-2 text-xs leading-5 text-white/45">{PLAYER_LIMIT_RULES_PUBLICATION_NOTE}</p>
      </section>

      <section>
        <div className="mb-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/75">Playing rules</p>
        </div>
        <div className="space-y-2">
          {matchRuleSections.map((section, index) => (
            <RuleCard key={section.title} title={section.title} points={section.points} open={index === 0} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 px-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Running the night</p>
        </div>
        <div className="space-y-2">
          {operatingGuideSections.map((section) => (
            <RuleCard key={section.title} title={section.title} points={section.points} />
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.08] px-3 py-2.5 text-xs leading-5 text-amber-100/75">
        If something is not covered here, add a clear note to the night sheet for SIXFL to review.
      </div>
    </RefereeAppShell>
  );
}
