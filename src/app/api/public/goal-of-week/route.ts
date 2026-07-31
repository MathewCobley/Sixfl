import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<FeaturedGoalRow[]>(Prisma.sql`
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
      LIMIT 1
    `);

    const goal = rows[0];
    const videoId = goal ? getYouTubeVideoId(goal.videoUrl) : null;

    if (!goal || !videoId) {
      return NextResponse.json({ goal: null }, { headers: noStoreHeaders });
    }

    return NextResponse.json(
      {
        goal: {
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
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load the featured Goal of the Week", error);
    return NextResponse.json({ goal: null }, { headers: noStoreHeaders });
  }
}
