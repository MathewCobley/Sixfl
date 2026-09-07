import Link from "next/link";
import GoalNomineeCard from "@/components/goal-of-month/GoalNomineeCard";
import WeeklyWinnerFeature from "@/components/home/GoalOfWeekHomepageFeature";
import { getMonthlyWinners, monthlyCandidatePayload } from "@/lib/goal-of-month/community";

export default async function MonthlyGoalHomepageFeature({ channelUrl }: { channelUrl: string }) {
  let winner = null;
  try { winner = (await getMonthlyWinners(new Date(), 1))[0] ?? null; }
  catch { /* Keep SIXFL TV available while the award database is unavailable. */ }
  return <div className="space-y-4">
    {winner ? <><p className="text-sm font-bold text-amber-100">Goal of the Month — latest winner</p><GoalNomineeCard goal={monthlyCandidatePayload(winner)} winner /></> : <><p className="text-sm text-white/60">Monthly competition now open. Previous weekly winners remain below until the first monthly winner.</p><WeeklyWinnerFeature channelUrl={channelUrl} /></>}
    <Link href="/goal-of-the-month" className="inline-flex rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-4 py-3 text-sm font-bold text-fuchsia-100">Watch nominees · nominate · vote →</Link>
  </div>;
}
