import sharp from "sharp";
import { Prisma } from "@prisma/client";

import { monthKey, nominationOpen } from "@/lib/goal-of-month/calendar";
import { prisma } from "@/lib/prisma";
import { fetchRailwayObject } from "@/lib/storage/railway-s3";
import { sixflTvThumbnailBackgroundKey } from "@/lib/sixfl-tv/thumbnail-background";

export type PublicGoalClip = {
  assetId: string;
  fixtureId: string;
  clipNumber: number;
  posterObjectKey: string | null;
  posterSizeBytes: number | null;
  kickoffAt: Date;
  homeTeamName: string;
  awayTeamName: string;
  scoringTeamName: string | null;
  scorerName: string | null;
};

type CandidateClipRow = PublicGoalClip & {
  candidateId: string;
};

type FixtureClipRow = PublicGoalClip & {
  candidateCount: number;
};

function validId(value: string) {
  return /^[A-Za-z0-9_-]{1,120}$/.test(value);
}

export async function getCandidateGoalClip(candidateId: string): Promise<CandidateClipRow | null> {
  if (!validId(candidateId)) return null;
  const rows = await prisma.$queryRaw<CandidateClipRow[]>(Prisma.sql`
    SELECT
      c."id" AS "candidateId",
      a."id" AS "assetId",
      a."fixtureId" AS "fixtureId",
      a."clipNumber"::int AS "clipNumber",
      a."posterObjectKey",
      a."posterSizeBytes"::int AS "posterSizeBytes",
      f."kickoffAt",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName",
      team."name" AS "scoringTeamName",
      c."scorerName"
    FROM "GoalOfMonthCandidate" c
    JOIN "SixflTvFootageAsset" a ON a."id" = c."clipAssetId"
    JOIN "Fixture" f ON f."id" = c."fixtureId" AND f."id" = a."fixtureId"
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    LEFT JOIN "Team" team ON team."id" = c."teamId"
    WHERE c."id" = ${candidateId}
      AND c."status" = 'ACTIVE'
      AND a."kind" = 'CLIP'
      AND a."state" = 'READY'
      AND a."clipNumber" IS NOT NULL
      AND f."status"::text = 'COMPLETED'
      AND f."publishedAt" IS NOT NULL
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getFixtureGoalClip(
  fixtureId: string,
  assetId: string,
  now = new Date(),
): Promise<FixtureClipRow | null> {
  if (!validId(fixtureId) || !validId(assetId)) return null;
  const rows = await prisma.$queryRaw<FixtureClipRow[]>(Prisma.sql`
    SELECT
      a."id" AS "assetId",
      a."fixtureId" AS "fixtureId",
      a."clipNumber"::int AS "clipNumber",
      a."posterObjectKey",
      a."posterSizeBytes"::int AS "posterSizeBytes",
      f."kickoffAt",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName",
      NULL::text AS "scoringTeamName",
      NULL::text AS "scorerName",
      (
        SELECT COUNT(*)::int
        FROM "GoalOfMonthCandidate" c
        WHERE c."clipAssetId" = a."id" AND c."status" = 'ACTIVE'
      ) AS "candidateCount"
    FROM "SixflTvFootageAsset" a
    JOIN "Fixture" f ON f."id" = a."fixtureId"
    JOIN "Team" home ON home."id" = f."homeTeamId"
    JOIN "Team" away ON away."id" = f."awayTeamId"
    WHERE a."id" = ${assetId}
      AND a."fixtureId" = ${fixtureId}
      AND a."kind" = 'CLIP'
      AND a."state" = 'READY'
      AND a."clipNumber" IS NOT NULL
      AND f."status"::text = 'COMPLETED'
      AND f."publishedAt" IS NOT NULL
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) return null;

  const [transition] = await prisma.$queryRaw<Array<{ firstMonth: string }>>(Prisma.sql`
    SELECT "firstMonth" FROM "GoalAwardTransition" WHERE "id" = 'monthly'
  `);
  const key = monthKey(row.kickoffAt);
  const currentlyNominatable = Boolean(
    transition &&
    key >= transition.firstMonth &&
    nominationOpen(key, now),
  );
  if (!currentlyNominatable && Number(row.candidateCount) < 1) return null;
  return row;
}

async function responseBytes(response: Response, maxBytes = 8 * 1024 * 1024) {
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function posterBytes(clip: PublicGoalClip) {
  if (clip.posterObjectKey) {
    try {
      const response = await fetchRailwayObject({
        key: clip.posterObjectKey,
        signal: AbortSignal.timeout(15000),
      });
      const bytes = await responseBytes(response);
      if (bytes?.length) return bytes;
    } catch {
      // Fall through to the fixture action frame while a clip poster is still being prepared.
    }
  }
  try {
    const response = await fetchRailwayObject({
      key: sixflTvThumbnailBackgroundKey(clip.fixtureId),
      signal: AbortSignal.timeout(15000),
    });
    const bytes = await responseBytes(response);
    if (bytes?.length) return bytes;
  } catch {
    // A plain branded fallback is generated below.
  }
  return null;
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fit(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export async function goalClipThumbnail(clip: PublicGoalClip) {
  const raw = await posterBytes(clip);
  const base = raw
    ? sharp(raw).resize(1280, 720, { fit: "cover" })
    : sharp({
        create: {
          width: 1280,
          height: 720,
          channels: 3,
          background: { r: 3, g: 12, b: 8 },
        },
      });

  const scorer = clip.scorerName?.trim() || clip.scoringTeamName?.trim() || "";
  const matchup = `${clip.homeTeamName} v ${clip.awayTeamName}`;
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000000" stop-opacity="0.22"/>
        <stop offset="0.55" stop-color="#000000" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.86"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#shade)"/>
    <rect x="54" y="48" width="286" height="48" rx="24" fill="#10b981"/>
    <text x="197" y="80" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="21" font-weight="800" fill="#02140d">GOAL OF THE MONTH</text>
    <rect x="54" y="112" width="118" height="38" rx="19" fill="#020805" fill-opacity="0.86" stroke="#6ee7b7" stroke-opacity="0.65"/>
    <text x="113" y="138" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="18" font-weight="800" fill="#d1fae5">Clip ${clip.clipNumber}</text>
    ${scorer ? `<text x="62" y="610" font-family="DejaVu Sans,sans-serif" font-size="42" font-weight="800" fill="#ffffff">${xml(fit(scorer, 34))}</text>` : ""}
    <text x="62" y="660" font-family="DejaVu Sans,sans-serif" font-size="28" font-weight="700" fill="#d1fae5">${xml(fit(matchup, 54))}</text>
    <circle cx="1162" cy="614" r="48" fill="#020805" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.5"/>
    <polygon points="1148,586 1148,642 1190,614" fill="#ffffff"/>
  </svg>`);

  return base
    .composite([{ input: overlay }])
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
