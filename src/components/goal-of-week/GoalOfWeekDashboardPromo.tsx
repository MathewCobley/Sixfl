"use client";

import Link from "next/link";
import GoalNomineeCard from "@/components/goal-of-month/GoalNomineeCard";
import { useMonthlyGoals } from "@/components/goal-of-month/useMonthlyGoals";

// Keep the shared captain/player import contract. The API owns the competition
// periods: never infer the award month from the browser's current date.
export default function GoalOfWeekDashboardPromo({ teamId, href }: { teamId: string; href: string }) {
  const { data, error, loading, refresh } = useMonthlyGoals();
  const target = href.startsWith("/goal-of-the-week")
    ? href.replace("/goal-of-the-week", "/goal-of-the-month")
    : `/goal-of-the-month?teamId=${encodeURIComponent(teamId)}`;
  const voting = Boolean(data?.voting.open && data.voting.candidates.length);
  const periods = data ? (voting ? [data.voting] : data.nominations) : [];
  // Preserve the three-clip preview budget and server ordering. When nomination
  // periods overlap, show each clip under its own competition's heading.
  const clips = periods.flatMap(period => period.candidates).slice(0, 3);
  const latestWinner = data?.winners[0];

  return (
    <section className="min-w-0 space-y-5 overflow-hidden rounded-3xl border border-fuchsia-300/25 bg-fuchsia-500/[0.06] p-5 sm:p-6" data-testid="goal-of-week-dashboard-promo" aria-label="Goal of the Month">
      {periods.length ? periods.map(period => {
        // The calendar service supplies the English month and year; retain the
        // full label alongside the month-first heading for year-end clarity.
        const month = period.label.replace(/\s+\d{4}$/, "");
        const periodClips = clips.filter(goal => goal.monthKey === period.key);
        return (
          <div key={period.key} data-monthly-period={period.key} className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-100/70">SIXFL TV · Player chosen · {period.label}</p>
                <h2 className="mt-2 text-2xl font-bold text-white">{month} Goal of the Month</h2>
                <p className="mt-2 text-sm font-semibold text-fuchsia-100">{voting ? "Voting is open — choose your winner" : "Current nominees"}</p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{voting ? "Watch the finalists and choose your winner. One vote per verified player." : `See a great goal from ${month}? Nominate a new one or back an existing nominee. Three nomination choices per player each month.`}</p>
              </div>
              <Link href={target} className="inline-flex rounded-xl bg-fuchsia-200 px-4 py-3 text-sm font-bold text-black">{voting ? "Vote now" : "Nominate / back goals"} →</Link>
            </div>
            {periodClips.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{periodClips.map(goal => <GoalNomineeCard key={goal.id} goal={goal} />)}</div>
            ) : (
              <p className="text-sm text-white/55">{period.candidates.length ? "More nominees are available on the competition page." : `No ${month} nominees yet. Be the first to put a goal forward.`}</p>
            )}
          </div>
        );
      }) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-100/70">SIXFL TV · Player chosen</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Goal of the Month</h2>
          </div>
          <Link href={target} className="inline-flex rounded-xl bg-fuchsia-200 px-4 py-3 text-sm font-bold text-black">Nominate / back goals →</Link>
          {data ? <p className="w-full text-sm text-white/55">No monthly competition is open for nominations right now.</p> : null}
        </div>
      )}
      {loading && !data ? <p role="status" className="text-sm text-white/60">Loading nominated goals…</p> : null}
      {error ? <p role="status" className="text-sm text-amber-100">{error} <button type="button" onClick={() => void refresh()} className="underline">Try again</button></p> : null}
      {latestWinner ? <div className="rounded-2xl border border-amber-200/20 p-4"><p className="mb-3 text-sm font-bold text-amber-100">Latest monthly winner</p><div className="max-w-sm"><GoalNomineeCard goal={latestWinner} winner /></div></div> : null}
      <p className="text-xs leading-5 text-white/45">Nominate a new goal or back an existing nominee through the month and until the 5th of the next month. The six most-backed nominees go to the player vote from the 6th–12th.</p>
    </section>
  );
}
