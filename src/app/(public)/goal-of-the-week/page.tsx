import Link from "next/link";

import CommunityGoalOfWeekPanel from "@/components/goal-of-week/CommunityGoalOfWeekPanel";
import GoalOfWeekHomepageFeature from "@/components/home/GoalOfWeekHomepageFeature";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Goal of the Week | SIXFL",
  description:
    "Watch the latest SIXFL Goal of the Week, nominate goals from SIXFL TV and vote for the weekly winner.",
};

const SIXFL_TV_CHANNEL_URL =
  "https://youtube.com/@sixfl?si=it2uNcdU3fHIf094";

type SearchParams = Promise<{
  from?: string;
  teamId?: string;
}>;

function cleanTeamId(value: string | undefined) {
  const cleaned = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{6,120}$/.test(cleaned) ? cleaned : "";
}

export default async function GoalOfTheWeekPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const query = (await searchParams) ?? {};
  const teamId = cleanTeamId(query.teamId);
  const from = query.from === "captain" || query.from === "player" ? query.from : "";
  const backHref =
    teamId && from === "captain"
      ? `/captain/team/${teamId}`
      : teamId && from === "player"
        ? `/player/team/${teamId}`
        : null;
  const backLabel =
    from === "captain" ? "Back to captain dashboard" : "Back to player dashboard";

  return (
    <div className="min-h-screen bg-[#06090f]">
      <div className="mx-auto w-full max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="overflow-hidden rounded-[2rem] border border-fuchsia-300/20 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_32%),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] p-6 shadow-[0_28px_100px_rgba(0,0,0,0.42)] sm:p-8 lg:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-4xl">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-200/75">
                SIXFL TV · Player chosen
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                Goal of the Week
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">
                One permanent place for Goal of the Week. Watch the latest winner, nominate goals from any completed SIXFL TV match, then vote for the six finalists.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/15"
                >
                  ← {backLabel}
                </Link>
              ) : null}
              <a
                href={SIXFL_TV_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white/75 transition hover:bg-white/[0.09] hover:text-white"
              >
                Open SIXFL TV ↗
              </a>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">1 · Watch</div>
              <div className="mt-2 font-bold text-white">Highlights appear through the week</div>
              <p className="mt-1 text-xs leading-5 text-white/50">Watch the uploaded SIXFL TV matches and pick the goals worth putting forward.</p>
            </div>
            <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/[0.07] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100/60">2 · Nominate</div>
              <div className="mt-2 font-bold text-white">Nominations close Sunday</div>
              <p className="mt-1 text-xs leading-5 text-white/50">Verified SIXFL players and captains can nominate up to three different goals.</p>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/60">3 · Vote</div>
              <div className="mt-2 font-bold text-white">Vote Monday to Tuesday 6pm</div>
              <p className="mt-1 text-xs leading-5 text-white/50">The six most-nominated goals form the ballot. One verified player gets one vote.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <div className="mb-3 text-[11px] font-black uppercase tracking-[0.2em] text-amber-100/55">
              Latest published winner
            </div>
            <GoalOfWeekHomepageFeature channelUrl={SIXFL_TV_CHANNEL_URL} />
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
              How participation works
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Public to watch. SIXFL login to take part.</h2>
            <p className="mt-3 text-sm leading-7 text-white/60">
              Anyone can open this page from the website, a shared link or a QR code. Nominating and voting remain protected: the server only accepts them from a signed-in SIXFL player, captain or admin account.
            </p>
            <p className="mt-3 text-sm leading-7 text-white/60">
              If you came here from your team dashboard, use the back button above to return to the same team when you are finished.
            </p>
          </div>
        </section>

        <CommunityGoalOfWeekPanel
          teamId={teamId || undefined}
          showLatestWinner={false}
        />
      </div>
    </div>
  );
}
