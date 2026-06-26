// ========================================
// File: src/app/(public)/referee/match-rules/page.tsx
// ========================================

import Link from "next/link";

import RefereeTabs from "@/components/referee/RefereeTabs";
import { requireReferee } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ruleSections = [
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

export default async function RefereeMatchRulesPage() {
  const { user, isAdminPreview } = await requireReferee();
  const refereeName = user.name || user.email || "this referee";

  return (
    <main className="min-h-screen bg-[#07130f] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {isAdminPreview ? (
          <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-semibold text-white">Referee preview mode</div>
                <p className="mt-1 text-amber-50/80">
                  You are seeing what {refereeName} sees.
                </p>
              </div>
              <Link
                href={`/admin/referees/${user.id}/referee-preview/exit?to=${encodeURIComponent(`/admin/referees/${user.id}`)}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-semibold text-white transition hover:bg-black/30"
              >
                Switch back to Full Admin View
              </Link>
            </div>
          </section>
        ) : null}

        <RefereeTabs active="match-rules" />

        <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
          <div className="px-6 py-7 lg:px-8 lg:py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Match rules
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Referee match guide
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70 sm:text-base">
              A simple reference for how SIXFL matches should be run on the night. Keep the game moving, record scores clearly, and flag anything that needs admin review.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {ruleSections.map((section) => (
            <article key={section.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              <div className="mt-4 space-y-3">
                {section.points.map((point) => (
                  <div key={point} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/68">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-300" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100/85">
          <p className="font-semibold text-white">Need admin help?</p>
          <p className="mt-1">
            If something happens that is not covered here, add a clear note on the referee night page and submit the night for SIXFL to review.
          </p>
        </section>
      </div>
    </main>
  );
}
