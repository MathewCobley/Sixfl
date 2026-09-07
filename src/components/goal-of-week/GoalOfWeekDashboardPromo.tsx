"use client";

import Link from "next/link";
import GoalNomineeCard from "@/components/goal-of-month/GoalNomineeCard";
import { useMonthlyGoals } from "@/components/goal-of-month/useMonthlyGoals";

// Keep the existing import contract for captain and player dashboard owners.
// The content and data now come from the shared monthly competition, not a DOM
// rewrite or a second dashboard-only calculation of nominations or winners.
export default function GoalOfWeekDashboardPromo({ teamId, href }: { teamId: string; href: string }) {
  const { data, error, loading, refresh } = useMonthlyGoals();
  const target = href.startsWith("/goal-of-the-week")
    ? href.replace("/goal-of-the-week", "/goal-of-the-month")
    : `/goal-of-the-month?teamId=${encodeURIComponent(teamId)}`;
  const voting = Boolean(data?.voting.open && data.voting.candidates.length);
  const nominations = data?.nominations.flatMap(period => period.candidates) ?? [];
  const clips = (voting ? data!.voting.candidates : nominations).slice(0, 3);
  const latestWinner = data?.winners[0];
  const title = voting ? `${data!.voting.label} — voting is open` : "Goal of the Month — current nominees";
  return (
    <section className="min-w-0 space-y-5 overflow-hidden rounded-3xl border border-fuchsia-300/25 bg-fuchsia-500/[0.06] p-5 sm:p-6" data-testid="goal-of-week-dashboard-promo" aria-label="Goal of the Month">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-fuchsia-100/70">SIXFL TV · Player chosen</p><h2 className="mt-2 text-2xl font-bold text-white">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{voting ? "Watch the finalists and choose your winner. One vote per verified player." : "See a great goal? Nominate it here and its fixture footage joins the monthly contenders. Three nominations per player each month."}</p></div>
        <Link href={target} className="inline-flex rounded-xl bg-fuchsia-200 px-4 py-3 text-sm font-bold text-black">{voting ? "Vote now" : "Nominate / view all goals"} →</Link>
      </div>
      {loading && !data ? <p role="status" className="text-sm text-white/60">Loading nominated goals…</p> : null}
      {error ? <p role="status" className="text-sm text-amber-100">{error} <button type="button" onClick={() => void refresh()} className="underline">Try again</button></p> : null}
      {clips.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{clips.map(goal => <GoalNomineeCard key={goal.id} goal={goal} />)}</div> : data ? <p className="text-sm text-white/55">No current nominees yet. Be the first to put a goal forward.</p> : null}
      {latestWinner ? <div className="rounded-2xl border border-amber-200/20 p-4"><p className="mb-3 text-sm font-bold text-amber-100">Latest monthly winner</p><div className="max-w-sm"><GoalNomineeCard goal={latestWinner} winner /></div></div> : null}
      <p className="text-xs leading-5 text-white/45">Nominate through the month and until the 5th of the next month. Vote from the 6th–12th. Footage links may show match highlights; each card identifies the nominated goal number.</p>
    </section>
  );
}
