import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteRailwayObject, fetchRailwayObject, uploadRailwayObject } from "@/lib/storage/railway-s3";
import { createSixflTvThumbnail, type SixflTvGraphicFixture } from "./graphics";
import type { FootageAsset } from "./footage";

export type SixflTvRenderKind = "HIGHLIGHTS" | "FULL_MATCH";
const SIXFL_TV_RENDER_VERSION = 7;
export class StudioError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type RenderJobRow = {
  id: string; fixtureId: string; kind: SixflTvRenderKind; state: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  sourceFingerprint: string; createdAt: Date; updatedAt: Date; startedAt: Date | null; completedAt: Date | null;
  error: string | null; outputSizeBytes: bigint | null; partCount: number | null; durationMs: number | null;
};
type ThumbnailRow = {
  fixtureId: string; kind: SixflTvRenderKind; headline: string; strapline: string; showScore: boolean;
  objectKey: string; sha256: string; sizeBytes: number; updatedAt: Date;
};
type PublishRow = {
  id: string; kind: SixflTvRenderKind; state: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
  title: string; privacyStatus: "private" | "unlisted" | "public"; youtubeVideoId: string | null; youtubeUrl: string | null;
  error: string | null; createdAt: Date; completedAt: Date | null;
};
type Contribution = { name?: unknown; goals?: unknown };
type PriorFormFixture = {\n  homeTeamId: string;\n  awayTeamId: string;\n  kickoffAt: Date;\n  result: { homeScore: number; awayScore: number } | null;\n};\ntype StoredPredictorScoreRow = {\n  predictedHomeScore: number | null;\n  predictedAwayScore: number | null;\n  headline: string | null;\n};\n\n
function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://sixfl.co.uk").replace(/\/+$/, "");
}
function sha(value: string | Uint8Array) { return createHash("sha256").update(value).digest("hex"); }
function safeText(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function renderDto(row: RenderJobRow) {
  return { id: row.id, kind: row.kind, state: row.state, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() || null,
    error: row.error, sizeBytes: row.outputSizeBytes == null ? null : Number(row.outputSizeBytes), durationMs: row.durationMs };
}
function thumbnailDto(row: ThumbnailRow) {
  return { kind: row.kind, headline: row.headline, strapline: row.strapline, showScore: row.showScore, sizeBytes: row.sizeBytes,
    updatedAt: row.updatedAt.toISOString() };
}
function publishDto(row: PublishRow) {
  return { id: row.id, kind: row.kind, state: row.state, title: row.title, privacyStatus: row.privacyStatus,
    youtubeVideoId: row.youtubeVideoId, youtubeUrl: row.youtubeUrl, error: row.error,
    createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() || null };
}
function contributionNames(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const names: string[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Contribution;
    const name = typeof row.name === "string" ? safeText(row.name, 60) : "";
    const goals = Number(row.goals ?? 0);
    if (!name || !Number.isInteger(goals) || goals <= 0) continue;
    names.push(goals > 1 ? `${name} x${goals}` : name);
  }
  return names;
}

function recentFormFor(teamId: string, fixtures: PriorFormFixture[]) {
  return fixtures
    .filter(fixture => fixture.result && (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId))
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())
    .slice(-5)
    .map(fixture => {
      const result = fixture.result!;
      const teamScore = fixture.homeTeamId === teamId ? result.homeScore : result.awayScore;
      const opponentScore = fixture.homeTeamId === teamId ? result.awayScore : result.homeScore;
      return teamScore > opponentScore ? "W" as const : teamScore < opponentScore ? "L" as const : "D" as const;
    });
}
async function storedPredictorScore(fixtureId: string) {
  try {
    const rows = await prisma.$queryRaw<StoredPredictorScoreRow[]>`
      SELECT "predictedHomeScore","predictedAwayScore","headline"
      FROM "FixtureAiPrediction"
      WHERE "fixtureId"=${fixtureId}
      LIMIT 1`;
    const row = rows[0];
    if (!row || !Number.isInteger(row.predictedHomeScore) || !Number.isInteger(row.predictedAwayScore)) return null;
    return {
      firstTeamScore: Number(row.predictedHomeScore),
      secondTeamScore: Number(row.predictedAwayScore),
      headline: row.headline ? safeText(row.headline, 80) : null,
    };
  } catch {
    // Predictor history is optional for video generation; never manufacture a score.
    return null;
  }
}

export async function studioFixture(fixtureId: string) {
  const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId }, select: {
    id: true, kickoffAt: true, status: true,
    league: { select: { id: true, name: true, season: true } },
    homeTeam: { select: { id: true, name: true, logoUrl: true } },
    awayTeam: { select: { id: true, name: true, logoUrl: true } },
    selections: { select: { selectionStatus: true, isCaptain: true, isGoalkeeper: true, createdAt: true,
      teamMember: { select: { teamId: true, user: { select: { name: true } } } },
    } },
    result: { select: { id: true, homeScore: true, awayScore: true, isDisputed: true,
      overturn: { select: { id: true, rulesBasis: true } },
      teamMetadata: { select: { teamId: true, scorers: true, goalsRecorded: true } },
    } },
  } });
  if (!fixture) throw new StudioError("Fixture not found.", 404);
  return fixture;
}

export async function studioGraphicFixture(fixtureId: string): Promise<SixflTvGraphicFixture> {
  const fixture = await studioFixture(fixtureId);
  const [priorFixtures, predictor] = await Promise.all([
    prisma.fixture.findMany({
      where: {
        leagueId: fixture.league.id,
        kickoffAt: { lt: fixture.kickoffAt },
        result: { isNot: null },
        OR: [
          { homeTeamId: { in: [fixture.homeTeam.id, fixture.awayTeam.id] } },
          { awayTeamId: { in: [fixture.homeTeam.id, fixture.awayTeam.id] } },
        ],
      },
      orderBy: { kickoffAt: "desc" },
      take: 20,
      select: {
        homeTeamId: true,
        awayTeamId: true,
        kickoffAt: true,
        result: { select: { homeScore: true, awayScore: true } },
      },
    }) as Promise<PriorFormFixture[]>,
    storedPredictorScore(fixtureId),
  ]);
  const result = fixture.result;
  const scorers: string[] = [];
  if (result && !result.overturn) {
    for (const meta of result.teamMetadata) {
      const names = contributionNames(meta.scorers);
      if (!names.length) continue;
      const teamName = meta.teamId === fixture.homeTeam.id ? fixture.homeTeam.name : meta.teamId === fixture.awayTeam.id ? fixture.awayTeam.name : "Team";
      scorers.push(`${teamName}: ${names.join(", ")}`);
    }
  }
  const lineup = (teamId: string) => fixture.selections
    .filter(selection => selection.teamMember.teamId === teamId && selection.selectionStatus !== "NOT_SELECTED" && Boolean(selection.teamMember.user.name?.trim()))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(selection => {
      const name = safeText(selection.teamMember.user.name, 60);
      const suffix = [selection.isCaptain ? "C" : "", selection.isGoalkeeper ? "GK" : ""].filter(Boolean);
      return suffix.length ? `${name} (${suffix.join(", ")})` : name;
    });
  return {
    leagueName: [fixture.league.name, fixture.league.season].filter(Boolean).join(" · "),
    kickoffLabel: new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/London" }).format(fixture.kickoffAt),
    firstTeam: { name: fixture.homeTeam.name, logoUrl: fixture.homeTeam.logoUrl, score: result?.homeScore ?? null },
    secondTeam: { name: fixture.awayTeam.name, logoUrl: fixture.awayTeam.logoUrl, score: result?.awayScore ?? null },
    scorers,
    firstTeamLineup: lineup(fixture.homeTeam.id),
    secondTeamLineup: lineup(fixture.awayTeam.id),
    firstTeamForm: recentFormFor(fixture.homeTeam.id, priorFixtures),
    secondTeamForm: recentFormFor(fixture.awayTeam.id, priorFixtures),
    predictor,
    decisionNote: result?.overturn ? "Official competition decision — scorer list suppressed" : null,
  };
}

async function latestRows<T>(sql: Prisma.Sql) { return prisma.$queryRaw<T[]>(sql); }

export async function studioState(fixtureId: string) {
  await studioFixture(fixtureId);
  const [jobs, thumbs, connection, publishes] = await Promise.all([
    latestRows<RenderJobRow>(Prisma.sql`SELECT DISTINCT ON ("kind") * FROM "SixflTvRenderJob" WHERE "fixtureId"=${fixtureId} ORDER BY "kind","createdAt" DESC,"id" DESC`),
    latestRows<ThumbnailRow>(Prisma.sql`SELECT * FROM "SixflTvThumbnail" WHERE "fixtureId"=${fixtureId} ORDER BY "kind"`),
    prisma.$queryRaw<{ channelId: string | null; channelTitle: string | null; connectedAt: Date }[]>`SELECT "channelId","channelTitle","connectedAt" FROM "SixflTvYoutubeConnection" WHERE "id"='primary'`,
    latestRows<PublishRow>(Prisma.sql`SELECT DISTINCT ON ("kind") "id","kind","state","title","privacyStatus","youtubeVideoId","youtubeUrl","error","createdAt","completedAt" FROM "SixflTvYoutubePublish" WHERE "fixtureId"=${fixtureId} ORDER BY "kind","createdAt" DESC,"id" DESC`),
  ]);
  const youtubeConfigured = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "SIXFL_TV_TOKEN_KEY"].every(name => Boolean(process.env[name]?.trim()));
  return {
    renders: jobs.map(renderDto), thumbnails: thumbs.map(thumbnailDto), publishes: publishes.map(publishDto),
    youtube: { configured: youtubeConfigured, connected: Boolean(connection[0]), channelId: connection[0]?.channelId || null, channelTitle: connection[0]?.channelTitle || null },
  };
}

function readyAsset(rows: FootageAsset[], kind: string) {
  return rows.filter(asset => asset.kind === kind && asset.state === "READY").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
}

export async function requestRenders(fixtureId: string, actor: string) {
  const fixture = await studioFixture(fixtureId);
  if (!fixture.result) throw new StudioError("Enter the final result before generating SIXFL TV previews.", 409);
  if (fixture.result.isDisputed) throw new StudioError("This result is disputed. Resolve it before generating result-branded videos.", 409);
  const assets = await prisma.$queryRaw<FootageAsset[]>`
    SELECT * FROM "SixflTvFootageAsset" WHERE "state"='READY' AND ("fixtureId"=${fixtureId} OR "fixtureId" IS NULL)
    ORDER BY "position","completedAt","createdAt","id"`;
  const intro = readyAsset(assets, "INTRO"), outro = readyAsset(assets, "OUTRO");
  const readyHighlights = readyAsset(assets.filter(asset => asset.fixtureId === fixtureId), "HIGHLIGHTS");
  const clips = assets.filter(asset => asset.fixtureId === fixtureId && asset.kind === "CLIP" && asset.state === "READY").sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime());
  const fullMatch = readyAsset(assets.filter(asset => asset.fixtureId === fixtureId), "FULL_MATCH");
  const graphic = await studioGraphicFixture(fixtureId);
  const specs: Array<{ kind: SixflTvRenderKind; content: FootageAsset[] }> = [];
  // Individual clips are the editable highlights source and must win when present,
  // so the renderer can preserve their saved order and insert transitions between them.
  // A ready-made highlights file is only the fallback when no clips have been uploaded.
  if (clips.length) specs.push({ kind: "HIGHLIGHTS", content: clips });
  else if (readyHighlights) specs.push({ kind: "HIGHLIGHTS", content: [readyHighlights] });
  if (fullMatch) specs.push({ kind: "FULL_MATCH", content: [fullMatch] });
  if (!specs.length) throw new StudioError("Upload at least one completed highlight clip, ready-made highlights video, or full match first.", 409);
  const created: Array<ReturnType<typeof renderDto>> = [];
  for (const spec of specs) {
    const ordered = [...(intro ? [intro] : []), ...spec.content, ...(outro ? [outro] : [])];
    const metadata = { renderVersion: SIXFL_TV_RENDER_VERSION, fixture: graphic, label: spec.kind === "HIGHLIGHTS" ? "MATCH HIGHLIGHTS" : "FULL MATCH", contentAssetIds: spec.content.map(asset => asset.id) };
    const fingerprint = sha(JSON.stringify({ kind: spec.kind, assets: ordered.map(asset => asset.id), metadata }));
    const row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424421)::text`;
      const ready = await tx.$queryRaw<RenderJobRow[]>`SELECT * FROM "SixflTvRenderJob" WHERE "fixtureId"=${fixtureId} AND "kind"=${spec.kind} AND "sourceFingerprint"=${fingerprint} AND "state"='READY' ORDER BY "createdAt" DESC LIMIT 1`;
      if (ready[0]) return ready[0];
      const active = await tx.$queryRaw<RenderJobRow[]>`SELECT * FROM "SixflTvRenderJob" WHERE "fixtureId"=${fixtureId} AND "kind"=${spec.kind} AND "state" IN ('QUEUED','PROCESSING') FOR UPDATE`;
      if (active[0]) {
        if (active[0].sourceFingerprint === fingerprint) return active[0];
        throw new StudioError(`${spec.kind === "HIGHLIGHTS" ? "Highlights" : "Full match"} rendering is already in progress. Wait for it to finish before changing the source.`, 409);
      }
      const id = randomUUID();
      const inserted = await tx.$queryRaw<RenderJobRow[]>`
        INSERT INTO "SixflTvRenderJob" ("id","fixtureId","kind","sourceFingerprint","metadataJson","requestedByActor")
        VALUES (${id},${fixtureId},${spec.kind},${fingerprint},${JSON.stringify(metadata)}::jsonb,${actor}) RETURNING *`;
      let position = 0;
      if (intro) await tx.$executeRaw`INSERT INTO "SixflTvRenderInput" ("jobId","assetId","role","position") VALUES (${id},${intro.id},'INTRO',${position++})`;
      for (const content of spec.content) await tx.$executeRaw`INSERT INTO "SixflTvRenderInput" ("jobId","assetId","role","position") VALUES (${id},${content.id},'CONTENT',${position++})`;
      if (outro) await tx.$executeRaw`INSERT INTO "SixflTvRenderInput" ("jobId","assetId","role","position") VALUES (${id},${outro.id},'OUTRO',${position++})`;
      return inserted[0];
    });
    created.push(renderDto(row));
  }
  return { renders: created, missing: { highlights: !readyHighlights && !clips.length, fullMatch: !fullMatch } };
}

export async function thumbnailPreviewResponse(fixtureId: string, kind: SixflTvRenderKind, data: Record<string, unknown>) {
  if (kind !== "HIGHLIGHTS" && kind !== "FULL_MATCH") throw new StudioError("Unknown thumbnail type.");
  const fixture = await studioFixture(fixtureId);
  if (!fixture.result || fixture.result.isDisputed) throw new StudioError("A confirmed final result is required before previewing the thumbnail.", 409);
  const headline = safeText(data.headline || (kind === "HIGHLIGHTS" ? "MATCH HIGHLIGHTS" : "FULL MATCH"), 80);
  const strapline = safeText(data.strapline || fixture.league.name, 120);
  if (!headline) throw new StudioError("Add a thumbnail headline.");
  const showScore = data.showScore !== false && data.showScore !== "false" && data.showScore !== "0";
  const graphic = await studioGraphicFixture(fixtureId);
  const bytes = await createSixflTvThumbnail({ fixture: graphic, headline, strapline, showScore, siteUrl: siteUrl() });
  if (bytes.length > 50 * 1024 * 1024) throw new StudioError("Generated thumbnail is unexpectedly large.", 500);
  return new Response(bytes, { headers: {
    "Content-Type": "image/png",
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline; filename=\"sixfl-tv-thumbnail-preview.png\"",
  } });
}

export async function saveThumbnail(fixtureId: string, kind: SixflTvRenderKind, actor: string, data: Record<string, unknown>) {
  if (kind !== "HIGHLIGHTS" && kind !== "FULL_MATCH") throw new StudioError("Unknown thumbnail type.");
  const fixture = await studioFixture(fixtureId);
  if (!fixture.result || fixture.result.isDisputed) throw new StudioError("A confirmed final result is required before saving the thumbnail.", 409);
  const existing = await prisma.$queryRaw<ThumbnailRow[]>`SELECT * FROM "SixflTvThumbnail" WHERE "fixtureId"=${fixtureId} AND "kind"=${kind}`;
  const headline = safeText(data.headline || existing[0]?.headline || (kind === "HIGHLIGHTS" ? "MATCH HIGHLIGHTS" : "FULL MATCH"), 80);
  const strapline = safeText(data.strapline || existing[0]?.strapline || fixture.league.name, 120);
  if (!headline) throw new StudioError("Add a thumbnail headline.");
  const showScore = data.showScore !== false;
  const graphic = await studioGraphicFixture(fixtureId);
  const bytes = await createSixflTvThumbnail({ fixture: graphic, headline, strapline, showScore, siteUrl: siteUrl() });
  if (bytes.length > 50 * 1024 * 1024) throw new StudioError("Generated thumbnail is unexpectedly large.", 500);
  const digest = sha(bytes), key = `sixfl-tv-thumbnail/v1/${fixtureId}/${kind.toLowerCase()}/${randomUUID()}-${digest}.png`;
  await uploadRailwayObject({ key, body: bytes, contentType: "image/png", signal: AbortSignal.timeout(30000) });
  const oldKey = existing[0]?.objectKey || null;
  try {
    await prisma.$executeRaw`
      INSERT INTO "SixflTvThumbnail" ("fixtureId","kind","headline","strapline","showScore","objectKey","sha256","sizeBytes","updatedByActor")
      VALUES (${fixtureId},${kind},${headline},${strapline},${showScore},${key},${digest},${bytes.length},${actor})
      ON CONFLICT ("fixtureId","kind") DO UPDATE SET "headline"=EXCLUDED."headline","strapline"=EXCLUDED."strapline","showScore"=EXCLUDED."showScore","objectKey"=EXCLUDED."objectKey","sha256"=EXCLUDED."sha256","sizeBytes"=EXCLUDED."sizeBytes","updatedByActor"=EXCLUDED."updatedByActor","updatedAt"=NOW()`;
  } catch (error) {
    await deleteRailwayObject(key, AbortSignal.timeout(15000)).catch(() => undefined);
    throw error;
  }
  if (oldKey && oldKey !== key) await deleteRailwayObject(oldKey, AbortSignal.timeout(15000)).catch(() => undefined);
  return { kind, headline, strapline, showScore, sizeBytes: bytes.length };
}

export async function thumbnailResponse(request: Request, fixtureId: string, kind: SixflTvRenderKind) {
  const rows = await prisma.$queryRaw<ThumbnailRow[]>`SELECT * FROM "SixflTvThumbnail" WHERE "fixtureId"=${fixtureId} AND "kind"=${kind}`;
  if (!rows[0]) throw new StudioError("Thumbnail not found.", 404);
  const response = await fetchRailwayObject({ key: rows[0].objectKey, signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]) });
  if (!response.ok || !response.body) throw new StudioError("Thumbnail storage is unavailable.", 503);
  return new Response(response.body, { headers: { "Content-Type": "image/png", "Content-Length": String(rows[0].sizeBytes), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline; filename=\"sixfl-tv-thumbnail.png\"" } });
}
