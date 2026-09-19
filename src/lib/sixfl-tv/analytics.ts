import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getYouTubeVideoId } from "@/lib/youtube";
import { getSixflTvVideos } from "@/lib/sixfl-tv/videos";
import {
  getYoutubeConnectionStatus,
  youtubeAccessToken,
} from "@/lib/sixfl-tv/youtube";

type Db = Pick<typeof prisma, "$queryRaw" | "$executeRaw">;

export const SIXFL_TV_VIEW_SCORE_MIN = 50;
export const SIXFL_TV_VIEW_SCORE_MAX = 150;
export const SIXFL_TV_VIEW_SCORE_PRIOR_FIXTURES = 2;
export const SIXFL_TV_VIEW_BONUS_MAX = 10;
export const SIXFL_TV_AWARD_NOMINATION_BONUS_MAX = 5;
export const SIXFL_TV_AWARD_VOTE_BONUS_MAX = 5;
export const SIXFL_TV_ENGAGEMENT_BONUS_MAX = 20;
export const SIXFL_TV_AWARD_LOOKBACK_DAYS = 60;
export const SIXFL_TV_YOUTUBE_REFRESH_HOURS = 6;

type TeamCohortRow = {
  id: string;
  name: string;
  leagueId: string;
  divisionId: string | null;
  leagueName: string;
  divisionName: string | null;
};

type LinkedFixtureRow = {
  fixtureId: string;
  kickoffAt: Date;
  leagueId: string;
  divisionId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  sixflTvUrl: string;
};

type LinkedVideoRef = LinkedFixtureRow & {
  videoId: string;
  kind: "HIGHLIGHTS" | "FULL_MATCH" | "EXTRA";
  url: string;
};

type SnapshotDbRow = {
  videoId: string;
  title: string | null;
  viewCount: bigint;
  likeCount: bigint | null;
  commentCount: bigint | null;
  publishedAt: Date | null;
  capturedAt: Date;
  rn?: bigint | number;
};

export type SixflTvViewScore = {
  teamId: string;
  teamName: string;
  leagueId: string;
  leagueName: string;
  divisionId: string | null;
  divisionName: string | null;
  cohortLabel: string;
  recordedFixtures: number;
  averageViews: number;
  cohortAverageViews: number;
  viewScore: number;
  viewBonus: number;
  provisional: boolean;
  latestCaptureAt: Date | null;
};

export type SixflTvEngagementScore = SixflTvViewScore & {
  nominationParticipants: number;
  voteParticipants: number;
  nominationPoints: number;
  votePoints: number;
  engagementBonus: number;
};

export type SixflTvAnalyticsVideo = {
  videoId: string;
  title: string;
  url: string;
  kind: string;
  fixtureId: string;
  fixtureLabel: string;
  kickoffAt: Date;
  views: number;
  likes: number | null;
  comments: number | null;
  viewsGained: number | null;
  capturedAt: Date;
};

export type SixflTvVideoViewMetric = {
  videoId: string;
  views: number;
  sevenDayGain: number | null;
  trackingGain: number | null;
  hasSevenDayBaseline: boolean;
  trackingStartedAt: Date;
  capturedAt: Date;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateSixflTvViewScore(input: {
  teamAverageViews: number;
  recordedFixtures: number;
  cohortAverageViews: number;
}) {
  const benchmark = Math.max(0, input.cohortAverageViews);
  const sample = Math.max(0, Math.trunc(input.recordedFixtures));
  if (!benchmark || !sample || input.teamAverageViews < 0) {
    return { viewScore: 100, viewBonus: 0, adjustedAverageViews: benchmark || 0 };
  }

  const adjustedAverageViews =
    (input.teamAverageViews * sample +
      benchmark * SIXFL_TV_VIEW_SCORE_PRIOR_FIXTURES) /
    (sample + SIXFL_TV_VIEW_SCORE_PRIOR_FIXTURES);

  const viewScore = clamp(
    Math.round((adjustedAverageViews / benchmark) * 100),
    SIXFL_TV_VIEW_SCORE_MIN,
    SIXFL_TV_VIEW_SCORE_MAX,
  );
  const viewBonus = clamp(
    Math.round((viewScore - SIXFL_TV_VIEW_SCORE_MIN) / 10),
    0,
    SIXFL_TV_VIEW_BONUS_MAX,
  );
  return { viewScore, viewBonus, adjustedAverageViews };
}

async function currentTeamCohorts(db: Db = prisma): Promise<TeamCohortRow[]> {
  return db.$queryRaw<TeamCohortRow[]>(Prisma.sql`
    SELECT
      t.id,
      t.name,
      COALESCE(current_entry."leagueId", t."leagueId") AS "leagueId",
      COALESCE(current_entry."divisionId", t."divisionId") AS "divisionId",
      l.name AS "leagueName",
      d.name AS "divisionName"
    FROM "Team" t
    LEFT JOIN LATERAL (
      SELECT lst."leagueId", lst."divisionId"
      FROM "LeagueSeasonTeam" lst
      WHERE lst."teamId" = t.id AND lst."isActive" = true
      ORDER BY lst."updatedAt" DESC, lst."createdAt" DESC, lst.id DESC
      LIMIT 1
    ) current_entry ON true
    JOIN "League" l ON l.id = COALESCE(current_entry."leagueId", t."leagueId")
    LEFT JOIN "LeagueDivision" d ON d.id = COALESCE(current_entry."divisionId", t."divisionId")
    WHERE COALESCE(t."isFixturePlaceholder", false) = false
    ORDER BY l.name, COALESCE(d."sortOrder", 999), d.name NULLS LAST, t.name, t.id
  `);
}

async function linkedFixtureRows(db: Db = prisma): Promise<LinkedFixtureRow[]> {
  return db.$queryRaw<LinkedFixtureRow[]>(Prisma.sql`
    SELECT
      f.id AS "fixtureId",
      f."kickoffAt",
      f."leagueId",
      f."divisionId",
      f."homeTeamId",
      f."awayTeamId",
      home.name AS "homeTeamName",
      away.name AS "awayTeamName",
      f."sixflTvUrl"
    FROM "Fixture" f
    JOIN "Team" home ON home.id = f."homeTeamId"
    JOIN "Team" away ON away.id = f."awayTeamId"
    WHERE f.status::text = 'COMPLETED'
      AND COALESCE(f."sixflTvUrl", '') <> ''
      AND COALESCE(home."isFixturePlaceholder", false) = false
      AND COALESCE(away."isFixturePlaceholder", false) = false
      AND home.id <> away.id
    ORDER BY f."kickoffAt" DESC, f.id DESC
  `);
}

async function linkedYoutubeVideos(db: Db = prisma): Promise<LinkedVideoRef[]> {
  const fixtures = await linkedFixtureRows(db);
  const refs: LinkedVideoRef[] = [];
  for (const fixture of fixtures) {
    for (const video of getSixflTvVideos(fixture.sixflTvUrl)) {
      const videoId = getYouTubeVideoId(video.url);
      if (!videoId) continue;
      refs.push({
        ...fixture,
        videoId,
        kind: video.kind,
        url: video.url,
      });
    }
  }
  return refs;
}

async function latestSnapshots(db: Db = prisma) {
  const rows = await db.$queryRaw<SnapshotDbRow[]>(Prisma.sql`
    SELECT DISTINCT ON ("videoId")
      "videoId", title, "viewCount", "likeCount", "commentCount", "publishedAt", "capturedAt"
    FROM "SixflTvYoutubeMetricSnapshot"
    ORDER BY "videoId", "capturedAt" DESC, id DESC
  `);
  return new Map(rows.map((row) => [row.videoId, row]));
}

export async function getSixflTvVideoViewMetrics(
  videoIds: string[],
  db: Db = prisma,
): Promise<Map<string, SixflTvVideoViewMetric>> {
  const unique = [...new Set(videoIds.filter(Boolean))];
  if (!unique.length) return new Map();

  const rows = await db.$queryRaw<Array<{
    videoId: string;
    viewCount: bigint;
    capturedAt: Date;
  }>>(Prisma.sql`
    SELECT "videoId", "viewCount", "capturedAt"
    FROM "SixflTvYoutubeMetricSnapshot"
    WHERE "videoId" IN (${Prisma.join(unique)})
    ORDER BY "videoId", "capturedAt", id
  `);

  const grouped = new Map<string, Array<{ viewCount: bigint; capturedAt: Date }>>();
  for (const row of rows) {
    const list = grouped.get(row.videoId) ?? [];
    list.push({ viewCount: row.viewCount, capturedAt: row.capturedAt });
    grouped.set(row.videoId, list);
  }

  const result = new Map<string, SixflTvVideoViewMetric>();
  for (const videoId of unique) {
    const snapshots = grouped.get(videoId) ?? [];
    if (!snapshots.length) continue;

    const latest = snapshots[snapshots.length - 1];
    const earliest = snapshots[0];
    const sevenDaysAgo = latest.capturedAt.getTime() - 7 * 24 * 60 * 60 * 1000;
    let baseline: (typeof snapshots)[number] | null = null;
    for (const snapshot of snapshots) {
      if (snapshot.capturedAt.getTime() <= sevenDaysAgo) baseline = snapshot;
      else break;
    }

    const views = Number(latest.viewCount);
    const sevenDayGain = baseline
      ? Math.max(0, views - Number(baseline.viewCount))
      : null;
    const trackingGain =
      earliest.capturedAt.getTime() < latest.capturedAt.getTime()
        ? Math.max(0, views - Number(earliest.viewCount))
        : null;

    result.set(videoId, {
      videoId,
      views,
      sevenDayGain,
      trackingGain,
      hasSevenDayBaseline: baseline != null,
      trackingStartedAt: earliest.capturedAt,
      capturedAt: latest.capturedAt,
    });
  }

  return result;
}

async function latestTwoSnapshots(db: Db = prisma) {
  const rows = await db.$queryRaw<SnapshotDbRow[]>(Prisma.sql`
    SELECT "videoId", title, "viewCount", "likeCount", "commentCount", "publishedAt", "capturedAt", rn
    FROM (
      SELECT s.*,
        ROW_NUMBER() OVER (PARTITION BY "videoId" ORDER BY "capturedAt" DESC, id DESC) AS rn
      FROM "SixflTvYoutubeMetricSnapshot" s
    ) ranked
    WHERE rn <= 2
    ORDER BY "videoId", rn
  `);
  const current = new Map<string, SnapshotDbRow>();
  const previous = new Map<string, SnapshotDbRow>();
  for (const row of rows) {
    if (Number(row.rn) === 1) current.set(row.videoId, row);
    else if (Number(row.rn) === 2) previous.set(row.videoId, row);
  }
  return { current, previous };
}

function cohortKey(row: Pick<TeamCohortRow, "leagueId" | "divisionId">) {
  return row.divisionId ? `division:${row.divisionId}` : `league:${row.leagueId}`;
}

export async function getSixflTvViewScores(
  teamIds: string[],
  db: Db = prisma,
): Promise<Map<string, SixflTvViewScore>> {
  const requested = new Set(teamIds.filter(Boolean));
  if (!requested.size) return new Map();

  const [teams, refs, snapshots] = await Promise.all([
    currentTeamCohorts(db),
    linkedYoutubeVideos(db),
    latestSnapshots(db),
  ]);

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const fixtureViews = new Map<
    string,
    { kickoffAt: Date; homeTeamId: string; awayTeamId: string; views: number }
  >();
  const countedFixtureVideos = new Set<string>();

  for (const ref of refs) {
    if (ref.kind === "EXTRA") continue;
    const fixtureVideoKey = `${ref.fixtureId}:${ref.videoId}`;
    if (countedFixtureVideos.has(fixtureVideoKey)) continue;
    countedFixtureVideos.add(fixtureVideoKey);
    const snapshot = snapshots.get(ref.videoId);
    if (!snapshot) continue;
    const existing = fixtureViews.get(ref.fixtureId) ?? {
      kickoffAt: ref.kickoffAt,
      homeTeamId: ref.homeTeamId,
      awayTeamId: ref.awayTeamId,
      views: 0,
    };
    existing.views += Number(snapshot.viewCount);
    fixtureViews.set(ref.fixtureId, existing);
  }

  const fixturesByTeam = new Map<string, Array<{ fixtureId: string; kickoffAt: Date; views: number }>>();
  for (const [fixtureId, fixture] of fixtureViews) {
    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      const list = fixturesByTeam.get(teamId) ?? [];
      list.push({ fixtureId, kickoffAt: fixture.kickoffAt, views: fixture.views });
      fixturesByTeam.set(teamId, list);
    }
  }

  // Audience history deliberately uses every measured fixture; the five-match window applies only to reliability.
  const averages = new Map<string, { average: number; count: number }>();
  for (const team of teams) {
    const measuredFixtures = fixturesByTeam.get(team.id) ?? [];
    const average = measuredFixtures.length
      ? measuredFixtures.reduce((sum, row) => sum + row.views, 0) / measuredFixtures.length
      : 0;
    averages.set(team.id, { average, count: measuredFixtures.length });
  }

  const cohortAverages = new Map<string, number>();
  const grouped = new Map<string, number[]>();
  for (const team of teams) {
    const average = averages.get(team.id)!;
    if (!average.count) continue;
    const key = cohortKey(team);
    grouped.set(key, [...(grouped.get(key) ?? []), average.average]);
  }
  for (const [key, values] of grouped) {
    cohortAverages.set(key, values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  const latestCaptureAt = [...snapshots.values()].reduce<Date | null>(
    (latest, row) => (!latest || row.capturedAt > latest ? row.capturedAt : latest),
    null,
  );

  const result = new Map<string, SixflTvViewScore>();
  for (const teamId of requested) {
    const team = teamById.get(teamId);
    if (!team) continue;
    const own = averages.get(teamId) ?? { average: 0, count: 0 };
    const benchmark = cohortAverages.get(cohortKey(team)) ?? own.average;
    const calculated = calculateSixflTvViewScore({
      teamAverageViews: own.average,
      recordedFixtures: own.count,
      cohortAverageViews: benchmark,
    });
    result.set(teamId, {
      teamId,
      teamName: team.name,
      leagueId: team.leagueId,
      leagueName: team.leagueName,
      divisionId: team.divisionId,
      divisionName: team.divisionName,
      cohortLabel: team.divisionName
        ? `${team.leagueName} · ${team.divisionName}`
        : team.leagueName,
      recordedFixtures: own.count,
      averageViews: Math.round(own.average),
      cohortAverageViews: Math.round(benchmark || 0),
      viewScore: calculated.viewScore,
      viewBonus: calculated.viewBonus,
      provisional: own.count < 3,
      latestCaptureAt,
    });
  }
  return result;
}

async function getAwardParticipation(
  teamIds: string[],
  db: Db = prisma,
  now = new Date(),
) {
  if (!teamIds.length) return new Map<string, { nominations: number; votes: number }>();
  const since = new Date(now.getTime() - SIXFL_TV_AWARD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db.$queryRaw<Array<{ teamId: string; kind: string; participants: number }>>(Prisma.sql`
    WITH actions AS (
      SELECT "userId", 'NOMINATION'::text AS kind
      FROM "GoalOfWeekNomination"
      WHERE "createdAt" >= ${since}
      UNION ALL
      SELECT "userId", 'VOTE'::text AS kind
      FROM "GoalOfWeekVote"
      WHERE "updatedAt" >= ${since}
      UNION ALL
      SELECT "userId", 'NOMINATION'::text AS kind
      FROM "GoalOfMonthNomination"
      WHERE "createdAt" >= ${since}
      UNION ALL
      SELECT "userId", 'VOTE'::text AS kind
      FROM "GoalOfMonthVote"
      WHERE "updatedAt" >= ${since}
    ),
    memberships AS (
      SELECT "userId", "teamId" FROM "TeamMember"
      UNION
      SELECT "captainUserId" AS "userId", id AS "teamId"
      FROM "Team"
      WHERE "captainUserId" IS NOT NULL
    )
    SELECT
      memberships."teamId",
      actions.kind,
      COUNT(DISTINCT actions."userId")::int AS participants
    FROM actions
    JOIN memberships ON memberships."userId" = actions."userId"
    WHERE memberships."teamId" IN (${Prisma.join(teamIds)})
    GROUP BY memberships."teamId", actions.kind
  `);

  const result = new Map<string, { nominations: number; votes: number }>();
  for (const teamId of teamIds) result.set(teamId, { nominations: 0, votes: 0 });
  for (const row of rows) {
    const current = result.get(row.teamId);
    if (!current) continue;
    if (row.kind === "NOMINATION") current.nominations = Number(row.participants);
    if (row.kind === "VOTE") current.votes = Number(row.participants);
  }
  return result;
}

export async function getSixflTvEngagementScores(
  teamIds: string[],
  db: Db = prisma,
  now = new Date(),
): Promise<Map<string, SixflTvEngagementScore>> {
  const unique = [...new Set(teamIds.filter(Boolean))];
  if (!unique.length) return new Map();
  const [views, awards] = await Promise.all([
    getSixflTvViewScores(unique, db),
    getAwardParticipation(unique, db, now),
  ]);
  const result = new Map<string, SixflTvEngagementScore>();
  for (const teamId of unique) {
    const view = views.get(teamId);
    if (!view) continue;
    const award = awards.get(teamId) ?? { nominations: 0, votes: 0 };
    const nominationPoints = Math.min(
      SIXFL_TV_AWARD_NOMINATION_BONUS_MAX,
      award.nominations,
    );
    const votePoints = Math.min(SIXFL_TV_AWARD_VOTE_BONUS_MAX, award.votes);
    result.set(teamId, {
      ...view,
      nominationParticipants: award.nominations,
      voteParticipants: award.votes,
      nominationPoints,
      votePoints,
      engagementBonus: clamp(
        view.viewBonus + nominationPoints + votePoints,
        0,
        SIXFL_TV_ENGAGEMENT_BONUS_MAX,
      ),
    });
  }
  return result;
}

function parseCounter(value: string | undefined, fallback = BigInt(0)) {
  return value && /^[0-9]+$/.test(value) ? BigInt(value) : fallback;
}

export async function syncSixflTvYoutubeMetrics(options?: { force?: boolean }) {
  const status = await getYoutubeConnectionStatus();
  if (!status.configured || !status.connected) {
    return { synced: false, skipped: "not-connected", videos: 0, capturedAt: null };
  }

  const [latest] = await prisma.$queryRaw<Array<{ capturedAt: Date | null }>>(Prisma.sql`
    SELECT MAX("capturedAt") AS "capturedAt"
    FROM "SixflTvYoutubeMetricSnapshot"
  `);
  if (
    !options?.force &&
    latest?.capturedAt &&
    Date.now() - latest.capturedAt.getTime() <
      SIXFL_TV_YOUTUBE_REFRESH_HOURS * 60 * 60 * 1000
  ) {
    return {
      synced: false,
      skipped: "fresh",
      videos: 0,
      capturedAt: latest.capturedAt.toISOString(),
    };
  }

  const refs = await linkedYoutubeVideos();
  const videoIds = [...new Set(refs.map((ref) => ref.videoId))];
  if (!videoIds.length) {
    return { synced: false, skipped: "no-linked-videos", videos: 0, capturedAt: null };
  }

  const accessToken = await youtubeAccessToken();
  const capturedAt = new Date();
  let saved = 0;

  for (let offset = 0; offset < videoIds.length; offset += 50) {
    const batch = videoIds.slice(offset, offset + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("maxResults", "50");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const data = (await response.json().catch(() => ({}))) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; publishedAt?: string };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(data.error?.message || `YouTube statistics request failed (${response.status}).`);
    }

    const writes = (data.items ?? [])
      .filter((item) => Boolean(item.id))
      .map((item) => {
        const videoId = item.id!;
        const publishedAt =
          item.snippet?.publishedAt && !Number.isNaN(Date.parse(item.snippet.publishedAt))
            ? new Date(item.snippet.publishedAt)
            : null;
        return prisma.$executeRaw(Prisma.sql`
          INSERT INTO "SixflTvYoutubeMetricSnapshot" (
            "id", "videoId", title, "viewCount", "likeCount", "commentCount", "publishedAt", "capturedAt"
          ) VALUES (
            ${randomUUID()},
            ${videoId},
            ${item.snippet?.title?.trim().slice(0, 500) || null},
            ${parseCounter(item.statistics?.viewCount)},
            ${item.statistics?.likeCount == null ? null : parseCounter(item.statistics.likeCount)},
            ${item.statistics?.commentCount == null ? null : parseCounter(item.statistics.commentCount)},
            ${publishedAt},
            ${capturedAt}
          )
        `);
      });
    if (writes.length) {
      await prisma.$transaction(writes);
      saved += writes.length;
    }
  }

  return {
    synced: true,
    skipped: null,
    videos: saved,
    capturedAt: capturedAt.toISOString(),
  };
}

export async function getSixflTvAnalyticsDashboard(db: Db = prisma) {
  const teams = await currentTeamCohorts(db);
  const teamIds = teams.map((team) => team.id);
  const [engagement, refs, snapshots] = await Promise.all([
    getSixflTvEngagementScores(teamIds, db),
    linkedYoutubeVideos(db),
    latestTwoSnapshots(db),
  ]);

  const uniqueRefs = new Map<string, LinkedVideoRef>();
  for (const ref of refs) if (!uniqueRefs.has(ref.videoId)) uniqueRefs.set(ref.videoId, ref);

  let totalViews = 0;
  let viewsGained = 0;
  let comparableVideos = 0;
  let latestCaptureAt: Date | null = null;
  const videos: SixflTvAnalyticsVideo[] = [];

  for (const [videoId, ref] of uniqueRefs) {
    const current = snapshots.current.get(videoId);
    if (!current) continue;
    const previous = snapshots.previous.get(videoId);
    const views = Number(current.viewCount);
    const gained = previous ? Math.max(0, views - Number(previous.viewCount)) : null;
    totalViews += views;
    if (gained != null) {
      viewsGained += gained;
      comparableVideos += 1;
    }
    if (!latestCaptureAt || current.capturedAt > latestCaptureAt) latestCaptureAt = current.capturedAt;
    videos.push({
      videoId,
      title: current.title || `${ref.homeTeamName} vs ${ref.awayTeamName}`,
      url: ref.url,
      kind: ref.kind,
      fixtureId: ref.fixtureId,
      fixtureLabel: `${ref.homeTeamName} vs ${ref.awayTeamName}`,
      kickoffAt: ref.kickoffAt,
      views,
      likes: current.likeCount == null ? null : Number(current.likeCount),
      comments: current.commentCount == null ? null : Number(current.commentCount),
      viewsGained: gained,
      capturedAt: current.capturedAt,
    });
  }

  const teamRows = [...engagement.values()].sort(
    (a, b) =>
      b.viewScore - a.viewScore ||
      b.averageViews - a.averageViews ||
      a.teamName.localeCompare(b.teamName),
  );
  videos.sort((a, b) => b.views - a.views || a.fixtureLabel.localeCompare(b.fixtureLabel));

  return {
    totalViews,
    viewsGained: comparableVideos ? viewsGained : null,
    linkedVideos: uniqueRefs.size,
    videosWithMetrics: videos.length,
    comparableVideos,
    latestCaptureAt,
    teams: teamRows,
    videos,
  };
}
