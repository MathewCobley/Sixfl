import Link from "next/link";
import { Prisma } from "@prisma/client";

import CommunityGoalOfWeekPanel from "@/components/goal-of-week/CommunityGoalOfWeekPanel";
import GoalOfWeekHomepageFeature from "@/components/home/GoalOfWeekHomepageFeature";
import {
  getCommunityGoalWinners,
  splitSixflTvUrls,
} from "@/lib/goal-of-week/community";
import { prisma } from "@/lib/prisma";
import { getYouTubeVideoId } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Goal of the Week | SIXFL",
  description:
    "Watch SIXFL Goal of the Week winners, nominate goals from SIXFL TV and vote for the weekly winner.",
};

const SIXFL_TV_CHANNEL_URL =
  "https://youtube.com/@sixfl?si=it2uNcdU3fHIf094";

type SearchParams = Promise<{
  from?: string;
  teamId?: string;
}>;

type ManualWinnerRow = {
  id: string;
  videoUrl: string;
  playerName: string | null;
  opponentName: string | null;
  caption: string | null;
  weekOf: Date;
  isFeatured: boolean;
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

type ArchiveWinner = {
  id: string;
  weekOf: Date;
  teamName: string;
  teamLogoUrl: string | null;
  playerName: string | null;
  opponentName: string | null;
  caption: string | null;
  videoUrl: string | null;
  videoId: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
  source: "published" | "player-voted";
  voteCount: number | null;
  isFeatured: boolean;
};

function cleanTeamId(value: string | undefined) {
  const cleaned = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{6,120}$/.test(cleaned) ? cleaned : "";
}

function formatWeek(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(value);
}

async function loadWinnerArchive(): Promise<ArchiveWinner[]> {
  try {
    const [manual, community] = await Promise.all([
      prisma.$queryRaw<ManualWinnerRow[]>(Prisma.sql`
        SELECT
          goal."id",
          goal."videoUrl",
          goal."playerName",
          goal."opponentName",
          goal."caption",
          goal."weekOf",
          goal."isFeatured",
          team."name" AS "teamName",
          team."logoUrl" AS "teamLogoUrl",
          league."name" AS "leagueName",
          league."season" AS "leagueSeason"
        FROM "GoalOfWeek" goal
        JOIN "Team" team ON team."id" = goal."teamId"
        LEFT JOIN "League" league ON league."id" = team."leagueId"
        WHERE goal."publishedAt" IS NOT NULL
        ORDER BY goal."weekOf" DESC, goal."publishedAt" DESC
        LIMIT 48
      `),
      getCommunityGoalWinners(new Date(), 48),
    ]);

    const manualArchive: ArchiveWinner[] = manual.map((goal) => ({
      id: `manual-${goal.id}`,
      weekOf: goal.weekOf,
      teamName: goal.teamName,
      teamLogoUrl: goal.teamLogoUrl,
      playerName: goal.playerName,
      opponentName: goal.opponentName,
      caption: goal.caption,
      videoUrl: goal.videoUrl,
      videoId: getYouTubeVideoId(goal.videoUrl),
      leagueName: goal.leagueName,
      leagueSeason: goal.leagueSeason,
      source: "published",
      voteCount: null,
      isFeatured: goal.isFeatured,
    }));

    const communityArchive: ArchiveWinner[] = community.map((goal) => {
      const links = splitSixflTvUrls(goal.sixflTvUrl);
      const youtubeUrl = links.find((url) => Boolean(getYouTubeVideoId(url))) ?? null;
      const videoUrl = youtubeUrl ?? links[0] ?? null;
      return {
        id: `community-${goal.id}`,
        weekOf: goal.weekOf,
        teamName: goal.teamName,
        teamLogoUrl: goal.teamLogoUrl,
        playerName: goal.scorerName,
        opponentName: goal.opponentName,
        caption: `Player-voted winner · Goal ${goal.goalNumber}`,
        videoUrl,
        videoId: videoUrl ? getYouTubeVideoId(videoUrl) : null,
        leagueName: goal.leagueName,
        leagueSeason: goal.leagueSeason,
        source: "player-voted",
        voteCount: goal.voteCount,
        isFeatured: false,
      };
    });

    return [...manualArchive, ...communityArchive]
      .sort((a, b) => b.weekOf.getTime() - a.weekOf.getTime())
      .slice(0, 48);
  } catch (error) {
    console.error("Could not load Goal of the Week archive", error);
    return [];
  }
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
  const archive = await loadWinnerArchive();

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
                One permanent place for Goal of the Week. Watch every published winner, nominate goals from any completed SIXFL TV match, then vote for the six finalists.
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

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-fuchsia-100/55">
                Winner archive
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">Every Goal of the Week</h2>
              <p className="mt-2 text-sm text-white/55">
                Winners stay here even when they are no longer featured on the homepage.
              </p>
            </div>
            <span className="text-sm font-semibold text-white/40">
              {archive.length} winner{archive.length === 1 ? "" : "s"}
            </span>
          </div>

          {archive.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {archive.map((winner) => {
                const context = [winner.leagueName, winner.leagueSeason].filter(Boolean).join(" · ");
                return (
                  <article key={winner.id} className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
                    {winner.videoId ? (
                      <a href={winner.videoUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="block aspect-video overflow-hidden bg-black">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://i.ytimg.com/vi/${winner.videoId}/hqdefault.jpg`}
                          alt={`${winner.teamName} Goal of the Week`}
                          className="h-full w-full object-cover transition hover:scale-[1.02]"
                        />
                      </a>
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-black/50 px-6 text-center text-sm font-semibold text-white/40">
                        SIXFL Goal of the Week
                      </div>
                    )}

                    <div className="p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-100">
                          Goal of the Week
                        </span>
                        {winner.source === "player-voted" ? (
                          <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">
                            Player voted
                          </span>
                        ) : null}
                        {winner.isFeatured ? (
                          <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100">
                            Homepage feature
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-4 text-xl font-black text-white">
                        {winner.playerName || winner.teamName}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-white/70">
                        {winner.teamName}{winner.opponentName ? ` · vs ${winner.opponentName}` : ""}
                      </p>
                      <p className="mt-2 text-xs text-white/40">
                        Week of {formatWeek(winner.weekOf)}{context ? ` · ${context}` : ""}
                      </p>
                      {winner.voteCount !== null ? (
                        <p className="mt-2 text-xs font-semibold text-emerald-100/65">
                          {winner.voteCount} player vote{winner.voteCount === 1 ? "" : "s"}
                        </p>
                      ) : null}
                      {winner.caption ? (
                        <p className="mt-3 text-sm leading-6 text-white/55">{winner.caption}</p>
                      ) : null}
                      {winner.videoUrl ? (
                        <a
                          href={winner.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-4 inline-flex rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-bold text-white/75 transition hover:bg-white/[0.09] hover:text-white"
                        >
                          Watch goal ↗
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/45">
              Published Goal of the Week winners will build up here.
            </div>
          )}
        </section>

        <CommunityGoalOfWeekPanel
          teamId={teamId || undefined}
          showLatestWinner={false}
        />
      </div>
    </div>
  );
}
