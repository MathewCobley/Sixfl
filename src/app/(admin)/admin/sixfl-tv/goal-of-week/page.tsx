import Link from "next/link";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  getCommunityGoalBallot,
  getCommunityGoalCycle,
  getLatestCommunityGoalWinner,
  splitSixflTvUrls,
} from "@/lib/goal-of-week/community";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = { title: "Community Goal of the Week | SIXFL Admin" };

type RecentCandidate = {
  id: string;
  fixtureId: string;
  weekOf: Date;
  goalNumber: number;
  scorerName: string | null;
  status: string;
  teamName: string;
  opponentName: string;
  kickoffAt: Date;
  sixflTvUrl: string;
  nominationCount: number;
  voteCount: number;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(value);
}

function formatWeek(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(value);
}

async function setCandidateStatusAction(formData: FormData) {
  "use server";
  await requireAdmin();

  const candidateId = String(formData.get("candidateId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!candidateId || !["ACTIVE", "REMOVED"].includes(status)) return;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "GoalOfWeekCandidate"
    SET "status" = ${status}, "updatedAt" = NOW()
    WHERE "id" = ${candidateId}
  `);

  revalidatePath("/admin/sixfl-tv/goal-of-week");
  revalidatePath("/api/public/goal-of-week");
}

async function getRecentCandidates() {
  return prisma.$queryRaw<RecentCandidate[]>(Prisma.sql`
    SELECT
      candidate."id",
      candidate."fixtureId",
      candidate."weekOf",
      candidate."goalNumber"::int AS "goalNumber",
      candidate."scorerName",
      candidate."status",
      scoring_team."name" AS "teamName",
      CASE
        WHEN fixture."homeTeamId" = candidate."teamId" THEN away_team."name"
        ELSE home_team."name"
      END AS "opponentName",
      fixture."kickoffAt",
      fixture."sixflTvUrl" AS "sixflTvUrl",
      COUNT(DISTINCT nomination."id")::int AS "nominationCount",
      COUNT(DISTINCT vote."id")::int AS "voteCount"
    FROM "GoalOfWeekCandidate" candidate
    JOIN "Fixture" fixture ON fixture."id" = candidate."fixtureId"
    JOIN "Team" scoring_team ON scoring_team."id" = candidate."teamId"
    JOIN "Team" home_team ON home_team."id" = fixture."homeTeamId"
    JOIN "Team" away_team ON away_team."id" = fixture."awayTeamId"
    LEFT JOIN "GoalOfWeekNomination" nomination
      ON nomination."candidateId" = candidate."id"
    LEFT JOIN "GoalOfWeekVote" vote
      ON vote."candidateId" = candidate."id"
    GROUP BY
      candidate."id", candidate."fixtureId", candidate."weekOf",
      candidate."goalNumber", candidate."scorerName", candidate."status",
      scoring_team."name", fixture."homeTeamId", away_team."name",
      home_team."name", fixture."kickoffAt", fixture."sixflTvUrl"
    ORDER BY candidate."weekOf" DESC, COUNT(DISTINCT nomination."id") DESC,
      candidate."createdAt" ASC
    LIMIT 80
  `);
}

export default async function CommunityGoalOfWeekAdminPage() {
  await requireAdmin();
  const cycle = getCommunityGoalCycle();

  let recent: RecentCandidate[] = [];
  let ballot: Awaited<ReturnType<typeof getCommunityGoalBallot>> = [];
  let latestWinner: Awaited<ReturnType<typeof getLatestCommunityGoalWinner>> = null;
  let unavailable = false;

  try {
    [recent, ballot, latestWinner] = await Promise.all([
      getRecentCandidates(),
      getCommunityGoalBallot(cycle.votingWeekStart, 6),
      getLatestCommunityGoalWinner(),
    ]);
  } catch (error) {
    console.error("Community Goal of the Week admin data unavailable", error);
    unavailable = true;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-100/70">
              SIXFL TV community
            </p>
            <h1 className="mt-2 text-3xl font-black text-white">Player-chosen Goal of the Week</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-fuchsia-50/75">
              Players nominate goals from completed SIXFL TV fixtures. Duplicate nominations combine automatically, the six most nominated reach the next week's ballot, and every verified player gets one vote. You only need to intervene if a nomination is wrong or unsuitable.
            </p>
          </div>
          <Link
            href="/admin/sixfl-tv"
            className="inline-flex rounded-2xl border border-white/10 bg-black/25 px-4 py-2.5 text-sm font-semibold text-white/80"
          >
            Back to SIXFL TV
          </Link>
        </div>
      </section>

      {unavailable ? (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5 text-sm text-amber-100">
          Community Goal of the Week tables are not available yet. This normally means the database migration is still deploying.
        </section>
      ) : null}

      {!unavailable && latestWinner ? (
        <section className="rounded-3xl border border-amber-300/25 bg-amber-500/[0.08] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/65">Latest completed vote</p>
          <h2 className="mt-2 text-2xl font-black text-white">
            {latestWinner.scorerName || latestWinner.teamName} · Goal {latestWinner.goalNumber}
          </h2>
          <p className="mt-2 text-sm text-white/60">
            {latestWinner.teamName} vs {latestWinner.opponentName} · {latestWinner.voteCount} vote{latestWinner.voteCount === 1 ? "" : "s"} · {latestWinner.nominationCount} nomination{latestWinner.nominationCount === 1 ? "" : "s"}
          </p>
          {splitSixflTvUrls(latestWinner.sixflTvUrl)[0] ? (
            <a
              href={splitSixflTvUrls(latestWinner.sixflTvUrl)[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-50"
            >
              Open winning highlights ▶
            </a>
          ) : null}
        </section>
      ) : null}

      {!unavailable ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Current six-goal ballot</h2>
              <p className="mt-1 text-sm text-white/50">
                Goals from week of {formatWeek(cycle.votingWeekStart)}. {cycle.votingOpen ? `Voting closes ${formatDate(cycle.votingClosesAt)}.` : "Voting has closed."}
              </p>
            </div>
            <span className="text-2xl font-black text-fuchsia-100">{ballot.length}/6</span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {ballot.map((candidate, index) => (
              <div key={candidate.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200/60">Finalist {index + 1}</div>
                <div className="mt-1 font-semibold text-white">
                  {candidate.scorerName || candidate.teamName} · Goal {candidate.goalNumber}
                </div>
                <div className="mt-1 text-sm text-white/50">{candidate.teamName} vs {candidate.opponentName}</div>
                <div className="mt-2 text-xs text-white/45">
                  {candidate.nominationCount} nomination{candidate.nominationCount === 1 ? "" : "s"} · {candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}
                </div>
              </div>
            ))}
            {ballot.length === 0 ? (
              <div className="text-sm text-white/50">No goals reached this ballot.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {!unavailable ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 px-6 py-5">
            <h2 className="text-xl font-semibold text-white">Recent nominations</h2>
            <p className="mt-1 text-sm text-white/50">Remove only entries that identify the wrong goal/team or should not go to a public vote. There is no approval queue.</p>
          </div>
          <div className="divide-y divide-white/10">
            {recent.map((candidate) => {
              const videoUrl = splitSixflTvUrls(candidate.sixflTvUrl)[0] ?? null;
              return (
                <div key={candidate.id} className="px-6 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">
                          {candidate.scorerName || candidate.teamName} · Goal {candidate.goalNumber}
                        </h3>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${candidate.status === "ACTIVE" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-red-400/20 bg-red-500/10 text-red-100"}`}>
                          {candidate.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/50">
                        {candidate.teamName} vs {candidate.opponentName} · {formatDate(candidate.kickoffAt)} · week of {formatWeek(candidate.weekOf)}
                      </p>
                      <p className="mt-1 text-xs text-white/40">
                        {candidate.nominationCount} nomination{candidate.nominationCount === 1 ? "" : "s"} · {candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {videoUrl ? (
                        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70">
                          Watch highlights ▶
                        </a>
                      ) : null}
                      <form action={setCandidateStatusAction}>
                        <input type="hidden" name="candidateId" value={candidate.id} />
                        <input type="hidden" name="status" value={candidate.status === "ACTIVE" ? "REMOVED" : "ACTIVE"} />
                        <button type="submit" className={`rounded-xl border px-3 py-2 text-xs font-semibold ${candidate.status === "ACTIVE" ? "border-red-400/25 bg-red-500/10 text-red-100" : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"}`}>
                          {candidate.status === "ACTIVE" ? "Remove nomination" : "Restore nomination"}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
            {recent.length === 0 ? <div className="px-6 py-10 text-sm text-white/50">No player nominations yet.</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
