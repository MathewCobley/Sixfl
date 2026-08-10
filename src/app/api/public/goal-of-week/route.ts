import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import {
  getLatestCommunityGoalWinner,
  splitSixflTvUrls,
} from "@/lib/goal-of-week/community";
import { prisma } from "@/lib/prisma";
import { getYouTubeVideoId } from "@/lib/youtube";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FeaturedGoalRow = {
  id: string;
  videoUrl: string;
  playerName: string | null;
  opponentName: string | null;
  caption: string | null;
  weekOf: Date;
  publishedAt: Date;
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string | null;
  leagueSeason: string | null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

async function getManualFeaturedGoals() {
  return prisma.$queryRaw<FeaturedGoalRow[]>(Prisma.sql`
    SELECT
      goal."id",
      goal."videoUrl",
      goal."playerName",
      goal."opponentName",
      goal."caption",
      goal."weekOf",
      goal."publishedAt",
      team."name" AS "teamName",
      team."logoUrl" AS "teamLogoUrl",
      league."name" AS "leagueName",
      league."season" AS "leagueSeason"
    FROM "GoalOfWeek" goal
    JOIN "Team" team ON team."id" = goal."teamId"
    LEFT JOIN "League" league ON league."id" = team."leagueId"
    WHERE goal."isFeatured" = true
      AND goal."publishedAt" IS NOT NULL
    ORDER BY goal."weekOf" DESC, goal."publishedAt" DESC
    LIMIT 2
  `);
}

function serializeManualGoal(goal: FeaturedGoalRow | null | undefined) {
  if (!goal) return null;
  const videoId = getYouTubeVideoId(goal.videoUrl);
  if (!videoId) return null;

  return {
    id: goal.id,
    videoId,
    videoUrl: goal.videoUrl,
    playerName: goal.playerName,
    opponentName: goal.opponentName,
    caption: goal.caption,
    weekOf: goal.weekOf.toISOString(),
    publishedAt: goal.publishedAt.toISOString(),
    teamName: goal.teamName,
    teamLogoUrl: goal.teamLogoUrl,
    leagueName: goal.leagueName,
    leagueSeason: goal.leagueSeason,
    communitySelected: false,
  };
}

export async function GET() {
  try {
    const [manualGoals, communityWinner] = await Promise.all([
      getManualFeaturedGoals(),
      getLatestCommunityGoalWinner(),
    ]);

    const manualGoal = manualGoals[0] ?? null;
    const communityVideoUrl = communityWinner
      ? splitSixflTvUrls(communityWinner.sixflTvUrl).find((url) =>
          Boolean(getYouTubeVideoId(url)),
        ) ?? null
      : null;
    const communityVideoId = communityVideoUrl
      ? getYouTubeVideoId(communityVideoUrl)
      : null;
    const manualVideoId = manualGoal
      ? getYouTubeVideoId(manualGoal.videoUrl)
      : null;

    // A manually featured goal from the same/newer week acts as the admin
    // override. Otherwise a completed verified-player vote becomes the homepage
    // Goal of the Week automatically when its fixture has a YouTube highlights
    // link. Veo-only winners remain visible in player/admin dashboards while the
    // existing manual feature remains the public fallback.
    const useCommunity = Boolean(
      communityWinner &&
        communityVideoUrl &&
        communityVideoId &&
        (!manualGoal || communityWinner.weekOf.getTime() > manualGoal.weekOf.getTime()),
    );

    if (useCommunity && communityWinner && communityVideoUrl && communityVideoId) {
      return NextResponse.json(
        {
          goal: {
            id: `community-${communityWinner.id}`,
            videoId: communityVideoId,
            videoUrl: communityVideoUrl,
            playerName: communityWinner.scorerName,
            opponentName: communityWinner.opponentName,
            caption: `Player-voted Goal of the Week · Goal ${communityWinner.goalNumber} · ${communityWinner.voteCount} vote${communityWinner.voteCount === 1 ? "" : "s"}`,
            weekOf: communityWinner.weekOf.toISOString(),
            publishedAt: communityWinner.weekOf.toISOString(),
            teamName: communityWinner.teamName,
            teamLogoUrl: communityWinner.teamLogoUrl,
            leagueName: communityWinner.leagueName,
            leagueSeason: communityWinner.leagueSeason,
            communitySelected: true,
            goalNumber: communityWinner.goalNumber,
            nominationCount: communityWinner.nominationCount,
            voteCount: communityWinner.voteCount,
          },
          previousGoal: serializeManualGoal(manualGoal),
        },
        { headers: noStoreHeaders },
      );
    }

    if (!manualGoal || !manualVideoId) {
      return NextResponse.json(
        { goal: null, previousGoal: null },
        { headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        goal: serializeManualGoal(manualGoal),
        previousGoal: serializeManualGoal(manualGoals[1]),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load the featured Goal of the Week", error);
    return NextResponse.json(
      { goal: null, previousGoal: null },
      { headers: noStoreHeaders },
    );
  }
}
