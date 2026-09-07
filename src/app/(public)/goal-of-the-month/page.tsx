import Link from "next/link";
import MonthlyGoalsPanel from "@/components/goal-of-month/MonthlyGoalsPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Goal of the Month | SIXFL", description: "Watch the nominated SIXFL TV goals, nominate your favourites and vote for the monthly winner." };

type Query = { from?: string; teamId?: string; previewMembershipId?: string };
export default async function GoalOfTheMonthPage({ searchParams }: { searchParams?: Promise<Query> }) {
  const query = (await searchParams) ?? {};
  const safeId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{6,120}$/.test(value) ? value : "";
  const teamId = safeId(query.teamId);
  const from = query.from === "captain" || query.from === "player" ? query.from : "";
  // Preview context only affects the back link, never the acting account.
  const preview = from === "player" ? safeId(query.previewMembershipId) : "";
  const backHref = teamId && from ? `/${from}/team/${teamId}${preview ? `?previewMembershipId=${encodeURIComponent(preview)}` : ""}` : null;
  return (
    <div className="min-h-screen bg-[#060d0a] text-white">
      <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-fuchsia-300/20 bg-fuchsia-500/[0.06] p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-100/70">SIXFL TV · Player chosen</p>
          <h1 className="mt-3 text-4xl font-black sm:text-5xl">Goal of the Month</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/70">More time to watch, nominate and vote. Put forward goals from this month’s recorded matches and watch the contenders build up here and on your dashboard.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {backHref ? <Link href={backHref} className="rounded-xl border border-emerald-300/25 px-4 py-3 text-sm font-bold text-emerald-100">← Back to {from} dashboard</Link> : null}
            <Link href="/goal-of-the-week?legacy=1" className="rounded-xl border border-white/15 px-4 py-3 text-sm text-white/75">Weekly winner archive</Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><h2 className="font-bold">1 · Nominate</h2><p className="mt-2 text-sm leading-6 text-white/65">Goals belong to the month the match was played. Nominate until the 5th of the following month.</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><h2 className="font-bold">2 · Vote</h2><p className="mt-2 text-sm leading-6 text-white/65">The six most-nominated goals reach the ballot. Vote from the 6th–12th: one vote per verified player.</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><h2 className="font-bold">3 · Celebrate</h2><p className="mt-2 text-sm leading-6 text-white/65">The winner appears from the 13th and stays in the monthly archive. All deadlines use UK time.</p></div>
          </div>
        </header>
        <MonthlyGoalsPanel />
      </div>
    </div>
  );
}
