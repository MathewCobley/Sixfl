import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import sharp from "sharp";
import { Prisma, PrismaClient } from "@prisma/client";
import { createGoalOfMonthNominationEndCard, createGoalOfMonthNominationOverlay, createSixflTvGoalOfMonthCard, createSixflTvLeagueTableCard, createSixflTvLineupCard, createSixflTvScoreBug, createSixflTvThumbnail, createSixflTvVideoCard, type SixflTvGraphicFixture } from "../src/lib/sixfl-tv/graphics";
import { deleteRailwayObject, fetchRailwayObject, uploadRailwayObject } from "../src/lib/storage/railway-s3";
import { buildSixflTvVideoValue, parseSixflTvVideoValue } from "../src/lib/sixfl-tv/videos";
import { sixflTvThumbnailBackgroundKey } from "../src/lib/sixfl-tv/thumbnail-background";
import { sixflTvGoalClipPosterKey } from "../src/lib/sixfl-tv/goal-clip-poster";
import { monthlyCycle } from "../src/lib/goal-of-month/calendar";
import { goalOfMonthPromoVideoKey } from "../src/lib/goal-of-month/media";
import { sixflTvYoutubeDefaults } from "../src/lib/sixfl-tv/youtube-metadata";

const db = new PrismaClient();
const PART_BYTES = 8 * 1024 * 1024;
const POLL_MS = 5000;
const RENDER_HEARTBEAT_MS = 5000;
const renderSignals = new AsyncLocalStorage<AbortSignal>();
const shutdown = new AbortController();
const MAX_RENDER_MS = 2 * 60 * 60 * 1000;
const MAX_OUTPUT_BYTES = 16 * 1024 ** 3;
const FFMPEG_THREADS = 8;
const FFMPEG_FILTER_THREADS = 2;
const TITLE_SECONDS = 4;
const LINEUP_SECONDS = 5;
const LEAGUE_TABLE_SECONDS = 5;
const GOAL_OF_MONTH_END_SECONDS = 5;
const SWIPE_FRAMES = 24;
const SWIPE_FPS = 30;
const RETENTION_SWEEP_MS = 5 * 60 * 1000;
const RETENTION_DELETE_PARTS_PER_SWEEP = 40;
const YOUTUBE_UPLOAD_CHUNK_BYTES = 1024 * 1024;
const YOUTUBE_UPLOAD_BYTES_PER_SECOND = 5 * 1024 * 1024;
function operationSignal(ms: number) {
  return AbortSignal.any([shutdown.signal, AbortSignal.timeout(ms), ...(renderSignals.getStore() ? [renderSignals.getStore()!] : [])]);
}
function checkAbort() { shutdown.signal.throwIfAborted(); renderSignals.getStore()?.throwIfAborted(); }
async function ownLease(tx: Prisma.TransactionClient, job: Job) {
  checkAbort();
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SixflTvRenderJob" WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken} AND "state"='PROCESSING' AND "busyUntil">NOW() FOR UPDATE`;
  if (!rows[0]) throw new Error("Render ownership expired; this attempt cannot change the job.");
}
async function failJob(job: Job, message: string) {
  // An interrupted old process must never mark a replacement attempt failed.
  return db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='FAILED',"error"=${message},"leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken} AND "state"='PROCESSING'`;
}

type Job = { id: string; fixtureId: string; kind: "HIGHLIGHTS" | "FULL_MATCH"; metadataJson: Prisma.JsonValue; leaseToken: string | null };
type Input = { assetId: string; role: "INTRO" | "CONTENT" | "OUTRO"; position: number; filename: string; kind: string; partCount: number; sizeBytes: bigint; state: string; clipNumber: number | null };
type SourcePart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean; sha256: string };
type RenderPart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean; sha256: string };
type PublishJob = {
  id: string; fixtureId: string; kind: "HIGHLIGHTS" | "FULL_MATCH"; renderJobId: string; thumbnailObjectKey: string;
  title: string; description: string; privacyStatus: "private" | "unlisted" | "public"; resumableUrl: string | null; uploadedBytes: bigint;
  youtubeVideoId: string | null; youtubeUrl: string | null; notifySubscribers: boolean | null; notificationDay: Date | string | null;
};
type GoalMediaJob = {
  id: string;
  fixtureId: string;
  clipAssetId: string;
  mediaLeaseToken: string | null;
  mediaAttempts: number;
};
type GoalMediaDetails = {
  id: string;
  fixtureId: string;
  clipAssetId: string;
  monthKey: string;
  scorerName: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  opponentName: string;
  leagueName: string;
  kickoffAt: Date;
  playerImageUrl: string | null;
  clipNumber: number;
  filename: string;
  kind: string;
  partCount: number;
  sizeBytes: bigint;
  state: string;
};
type Metadata = {
  fixture: SixflTvGraphicFixture;
  label: string;
  contentAssetIds: string[];
  renderVersion?: number;
  progressPercent?: number;
  progressLabel?: string;
};
type FfmpegProgress = { durationSeconds: number; onFraction: (fraction: number) => void };
type RenderProgressReporter = (percent: number, label: string) => void;

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown worker error");
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 900) || "Worker operation failed.";
}
function siteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://sixfl.co.uk").replace(/\/+$/, ""); }
function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

async function run(
  bin: string,
  args: string[],
  capture = false,
  timeoutMs = bin === "ffprobe" ? 60000 : MAX_RENDER_MS,
  progress?: FfmpegProgress,
) {
  const signal = operationSignal(timeoutMs);
  signal.throwIfAborted();
  // Media inputs must stay local. Bound decoder, filter and encoder threads.
  // FFmpeg's machine-readable progress stream lets the admin UI show genuine
  // movement through long full-match encodes instead of a fake timer.
  const command = bin === "ffmpeg"
    ? [
        "-nostdin",
        "-protocol_whitelist", "file,pipe",
        "-threads", String(FFMPEG_THREADS),
        "-filter_threads", String(FFMPEG_FILTER_THREADS),
        "-filter_complex_threads", String(FFMPEG_FILTER_THREADS),
        ...(progress ? ["-progress", "pipe:2", "-nostats"] : []),
        ...args.slice(0, -1),
        "-threads", String(FFMPEG_THREADS),
        args.at(-1)!,
      ]
    : bin === "ffprobe" ? ["-protocol_whitelist", "file,pipe", ...args] : args;
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, command, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let stdout = "", stderr = "", progressBuffer = "", failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      failure = new Error("Video operation was cancelled or exceeded its time limit.");
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
    };
    signal.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", chunk => { stdout = (stdout + String(chunk)).slice(-65536); });
    child.stderr?.on("data", chunk => {
      const text = String(chunk);
      stderr = (stderr + text).slice(-65536);
      if (bin !== "ffmpeg" || !progress) return;
      progressBuffer += text;
      const rows = progressBuffer.split(/\r?\n/);
      progressBuffer = rows.pop() || "";
      for (const row of rows) {
        if (row.startsWith("out_time_us=")) {
          const micros = Number(row.slice("out_time_us=".length));
          if (Number.isFinite(micros) && progress.durationSeconds > 0) {
            progress.onFraction(Math.max(0, Math.min(0.995, micros / 1_000_000 / progress.durationSeconds)));
          }
        } else if (row.trim() === "progress=end") {
          progress.onFraction(1);
        }
      }
    });
    child.on("error", error => { failure = error; });
    // Wait for the process and pipes to close before deleting its temporary files.
    child.on("close", code => {
      signal.removeEventListener("abort", abort);
      if (killTimer) clearTimeout(killTimer);
      if (failure || signal.aborted) reject(failure || new Error("Video operation cancelled."));
      else if (code !== 0) reject(new Error(`${bin} exited ${code}: ${stderr.slice(-4000)}`));
      else resolve(stdout.trim());
    });
    if (signal.aborted) abort();
  });
}
async function durationSeconds(file: string) {
  const value = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], true);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("FFprobe could not determine video duration.");
  return seconds;
}
async function hasAudio(file: string) {
  const value = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", file], true);
  return Boolean(value.trim());
}

async function claimJob() {
  return db.$transaction(async tx => {
    // Serialize claims across rolling deployments or accidental duplicate workers.
    // SIXFL TV deliberately encodes one video at a time; everything else stays FIFO.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424422)::text`;
    await tx.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='QUEUED',"leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW(),"error"='Recovered after an interrupted worker.' WHERE "state"='PROCESSING' AND "busyUntil" < NOW()`;
    const active = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SixflTvRenderJob" WHERE "state"='PROCESSING' AND "busyUntil">NOW() ORDER BY "startedAt","createdAt","id" LIMIT 1 FOR UPDATE`;
    if (active[0]) return null;
    const jobs = await tx.$queryRaw<Job[]>`SELECT "id","fixtureId","kind","metadataJson","leaseToken" FROM "SixflTvRenderJob" WHERE "state"='QUEUED' ORDER BY "createdAt","id" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!jobs[0]) return null;
    const lease = randomUUID();
    await tx.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='PROCESSING',"leaseToken"=${lease},"busyUntil"=NOW()+INTERVAL '12 minutes',"startedAt"=COALESCE("startedAt",NOW()),"updatedAt"=NOW(),"error"=NULL WHERE "id"=${jobs[0].id}`;
    return { ...jobs[0], leaseToken: lease };
  });
}

async function claimGoalMediaJob() {
  return db.$transaction(async tx => {
    await tx.$executeRaw`
      UPDATE "GoalOfMonthCandidate"
      SET "mediaState" = 'QUEUED',
          "mediaLeaseToken" = NULL,
          "mediaBusyUntil" = NULL,
          "mediaQueuedAt" = NOW(),
          "updatedAt" = NOW(),
          "mediaError" = 'Recovered after an interrupted nomination render.'
      WHERE "mediaState" = 'PROCESSING'
        AND "mediaBusyUntil" < NOW()
        AND "clipAssetId" IS NOT NULL
        AND "status" = 'ACTIVE'
    `;

    const jobs = await tx.$queryRaw<GoalMediaJob[]>`
      SELECT "id", "fixtureId", "clipAssetId", "mediaLeaseToken", "mediaAttempts"
      FROM "GoalOfMonthCandidate"
      WHERE "status" = 'ACTIVE'
        AND "clipAssetId" IS NOT NULL
        AND "mediaState" = 'QUEUED'
      ORDER BY COALESCE("mediaQueuedAt", "createdAt"), "createdAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (!jobs[0]) return null;

    const lease = randomUUID();
    const changed = await tx.$executeRaw`
      UPDATE "GoalOfMonthCandidate"
      SET "mediaState" = 'PROCESSING',
          "mediaLeaseToken" = ${lease},
          "mediaBusyUntil" = NOW() + INTERVAL '15 minutes',
          "mediaStartedAt" = COALESCE("mediaStartedAt", NOW()),
          "mediaAttempts" = "mediaAttempts" + 1,
          "mediaError" = NULL,
          "updatedAt" = NOW()
      WHERE "id" = ${jobs[0].id}
        AND "mediaState" = 'QUEUED'
        AND "status" = 'ACTIVE'
    `;
    if (changed !== 1) return null;
    return { ...jobs[0], mediaLeaseToken: lease, mediaAttempts: Number(jobs[0].mediaAttempts) + 1 };
  });
}

async function failGoalMediaJob(job: GoalMediaJob, message: string) {
  return db.$executeRaw`
    UPDATE "GoalOfMonthCandidate"
    SET "mediaState" = CASE WHEN "mediaAttempts" < 3 THEN 'QUEUED' ELSE 'FAILED' END,
        "mediaQueuedAt" = CASE WHEN "mediaAttempts" < 3 THEN NOW() ELSE "mediaQueuedAt" END,
        "mediaError" = ${message},
        "mediaLeaseToken" = NULL,
        "mediaBusyUntil" = NULL,
        "updatedAt" = NOW()
    WHERE "id" = ${job.id}
      AND "mediaLeaseToken" = ${job.mediaLeaseToken}
      AND "mediaState" = 'PROCESSING'
  `;
}
async function loadInputs(jobId: string) {
  return db.$queryRaw<Input[]>`
    SELECT i."assetId",i."role",i."position",a."filename",a."kind",a."partCount",a."sizeBytes",a."state",a."clipNumber"
    FROM "SixflTvRenderInput" i JOIN "SixflTvFootageAsset" a ON a."id"=i."assetId"
    WHERE i."jobId"=${jobId} ORDER BY i."position",i."assetId"`;
}

async function verifiedPart(part: SourcePart) {
  checkAbort();
  if (!Number.isInteger(part.sizeBytes) || part.sizeBytes < 1 || part.sizeBytes > PART_BYTES || !/^[0-9a-f]{64}$/.test(part.sha256)) throw new Error("Invalid source manifest.");
  const response = await fetchRailwayObject({ key: part.objectKey, signal: operationSignal(60000) });
  if (!response.ok || !response.body) throw new Error(`Source storage returned ${response.status}.`);
  const reader = response.body.getReader(), chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      checkAbort();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > part.sizeBytes) throw new Error("Source part exceeds its recorded size.");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks, size);
  if (size !== part.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== part.sha256) throw new Error("Source part integrity check failed.");
  return bytes;
}
async function reconstructAsset(input: Input, target: string) {
  if (input.state !== "READY") throw new Error(`Source ${input.filename} is no longer ready.`);
  const parts = await db.$queryRaw<SourcePart[]>`SELECT "partNumber","objectKey","sizeBytes","stored","sha256" FROM "SixflTvFootagePart" WHERE "assetId"=${input.assetId} ORDER BY "partNumber"`;
  if (parts.length !== input.partCount || parts.some((part, index) => part.partNumber !== index || !part.stored)) throw new Error(`Source ${input.filename} is incomplete.`);
  const handle = await open(target, "w");
  try {
    let written = 0;
    for (const part of parts) {
      const bytes = await verifiedPart(part);
      let offset = 0;
      while (offset < bytes.length) {
        checkAbort();
        const result = await handle.write(bytes, offset, bytes.length - offset);
        if (!result.bytesWritten) throw new Error("Source file write made no progress.");
        offset += result.bytesWritten;
      }
      written += bytes.length;
    }
    if (BigInt(written) !== input.sizeBytes) throw new Error(`Source ${input.filename} byte count changed.`);
  } finally { await handle.close(); }
}

type PosterCandidate = { bytes: Buffer; score: number; source: string };

async function sourcePosterCandidate(source: string, dir: string, label: string): Promise<PosterCandidate | null> {
  try {
    const seconds = await durationSeconds(source);
    const fractions = seconds < 2 ? [0.5] : [0.3, 0.5, 0.7];
    let best: PosterCandidate | null = null;
    for (let index = 0; index < fractions.length; index++) {
      checkAbort();
      const at = Math.max(0.05, Math.min(Math.max(0.05, seconds - 0.05), seconds * fractions[index]));
      const target = path.join(dir, `poster-${label}-${index}.jpg`);
      await run("ffmpeg", [
        "-y", "-ss", at.toFixed(3), "-i", source, "-frames:v", "1",
        "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720",
        "-q:v", "2", target,
      ], false, 120000);
      const bytes = await readFile(target);
      const stats = await sharp(bytes).resize(320, 180, { fit: "cover" }).greyscale().stats();
      const mean = stats.channels[0]?.mean ?? 128;
      const brightnessPenalty = mean < 24 ? (24 - mean) * 0.18 : mean > 235 ? (mean - 235) * 0.18 : 0;
      const score = Number(stats.entropy || 0) * 6 + Number(stats.sharpness || 0) * 0.15 - brightnessPenalty;
      if (!best || score > best.score) best = { bytes, score, source: label };
    }
    return best;
  } catch (error) {
    console.warn(`Could not choose a thumbnail frame from ${label}: ${safeError(error)}`);
    return null;
  }
}

async function thumbnailBackgroundExists(fixtureId: string) {
  try {
    const response = await fetchRailwayObject({
      key: sixflTvThumbnailBackgroundKey(fixtureId),
      signal: operationSignal(15000),
    });
    await response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}

async function saveThumbnailBackground(fixtureId: string, candidate: PosterCandidate | null) {
  if (!candidate) return false;
  await uploadRailwayObject({
    key: sixflTvThumbnailBackgroundKey(fixtureId),
    body: candidate.bytes,
    contentType: "image/jpeg",
    signal: operationSignal(30000),
  });
  return true;
}

async function saveGoalClipPoster(assetId: string, candidate: PosterCandidate | null) {
  if (!candidate) return false;
  await uploadRailwayObject({
    key: sixflTvGoalClipPosterKey(assetId),
    body: candidate.bytes,
    contentType: "image/jpeg",
    signal: operationSignal(30000),
  });
  return true;
}

async function cardVideo(png: string, target: string, seconds = 3) {
  await run("ffmpeg", ["-y", "-loop", "1", "-i", png, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-t", String(seconds), "-shortest",
    "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
}

async function swipeVideo(dir: string, target: string) {
  const frameDir = path.join(dir, "swipe-frames");
  await mkdir(frameDir, { recursive: true });
  for (let frame = 0; frame < SWIPE_FRAMES; frame++) {
    checkAbort();
    const progress = frame / Math.max(1, SWIPE_FRAMES - 1);
    const x = Math.round(-900 + progress * 3720);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <rect width="1920" height="1080" fill="#020805"/>
      <polygon points="${x},0 ${x + 760},0 ${x + 260},1080 ${x - 500},1080" fill="#10b981"/>
      <polygon points="${x + 210},0 ${x + 430},0 ${x - 70},1080 ${x - 290},1080" fill="#ffffff" opacity="0.92"/>
      <polygon points="${x + 520},0 ${x + 680},0 ${x + 180},1080 ${x + 20},1080" fill="#064e3b" opacity="0.85"/>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
    await writeFile(path.join(frameDir, `frame-${String(frame).padStart(3, "0")}.png`), png);
  }
  await run("ffmpeg", ["-y", "-framerate", String(SWIPE_FPS), "-i", path.join(frameDir, "frame-%03d.png"),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-t", String(SWIPE_FRAMES / SWIPE_FPS), "-shortest",
    "-vf", "scale=1920:1080,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
}

async function normaliseVideo(source: string, target: string, scoreBug?: string, onProgress?: (fraction: number) => void) {
  const seconds = await durationSeconds(source), audio = await hasAudio(source);
  const ffmpegProgress = onProgress ? { durationSeconds: seconds, onFraction: onProgress } : undefined;
  const fadeOutStart = Math.max(0, seconds - 0.18).toFixed(3);
  const base = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p`;
  const fade = `fade=t=in:st=0:d=0.18,fade=t=out:st=${fadeOutStart}:d=0.18`;
  const audioFilter = `aresample=48000,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOutStart}:d=0.12`;
  if (scoreBug) {
    const videoFilter = `[0:v]${base}[base];[1:v]format=rgba[bug];[base][bug]overlay=0:0:format=auto,${fade},format=yuv420p[v]`;
    if (audio) {
      await run("ffmpeg", ["-y", "-i", source, "-loop", "1", "-i", scoreBug, "-filter_complex", videoFilter,
        "-map", "[v]", "-map", "0:a:0", "-af", audioFilter, "-t", String(seconds), "-shortest",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target], false, MAX_RENDER_MS, ffmpegProgress);
    } else {
      await run("ffmpeg", ["-y", "-i", source, "-loop", "1", "-i", scoreBug, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-filter_complex", videoFilter, "-map", "[v]", "-map", "2:a:0", "-t", String(seconds), "-shortest",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
    }
    return;
  }
  const videoFilter = `${base},${fade}`;
  if (audio) {
    await run("ffmpeg", ["-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0", "-vf", videoFilter, "-af", audioFilter,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
  } else {
    await run("ffmpeg", ["-y", "-i", source, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", "0:v:0", "-map", "1:a:0", "-t", String(seconds), "-shortest", "-vf", videoFilter,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
  }
}

type OutputProof = { sizeBytes: number; partCount: number; parts: RenderPart[] };
async function storeOutput(job: Job, file: string): Promise<OutputProof> {
  const handle = await open(file, "r"), parts: RenderPart[] = [];
  let position = 0, partNumber = 0;
  try {
    const fileSize = (await handle.stat()).size;
    if (!fileSize || fileSize > MAX_OUTPUT_BYTES) throw new Error("Rendered output exceeds the supported file size.");
    while (position < fileSize) {
      checkAbort();
      const bytes = Buffer.allocUnsafe(Math.min(PART_BYTES, fileSize - position));
      let filled = 0;
      while (filled < bytes.length) {
        const result = await handle.read(bytes, filled, bytes.length - filled, position + filled);
        if (!result.bytesRead) throw new Error("Rendered output ended unexpectedly.");
        filled += result.bytesRead;
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      const key = `sixfl-tv-render/v1/${job.id}/${partNumber}-${digest}`;
      await db.$transaction(async tx => {
        await ownLease(tx, job);
        await tx.$executeRaw`INSERT INTO "SixflTvRenderPart" ("jobId","partNumber","objectKey","sha256","sizeBytes") VALUES (${job.id},${partNumber},${key},${digest},${bytes.length}) ON CONFLICT ("jobId","partNumber") DO NOTHING`;
        const rows = await tx.$queryRaw<RenderPart[]>`SELECT "partNumber","objectKey","sha256","sizeBytes","stored" FROM "SixflTvRenderPart" WHERE "jobId"=${job.id} AND "partNumber"=${partNumber}`;
        const saved = rows[0];
        // Never mix bytes from two attempts. A different retry needs a fresh job.
        if (!saved || saved.sha256 !== digest || saved.objectKey !== key || saved.sizeBytes !== bytes.length) throw new Error("An interrupted render differs from this attempt. Generate a new preview; your sources are unchanged.");
      });
      await uploadRailwayObject({ key, body: bytes, contentType: "application/octet-stream", signal: operationSignal(60000) });
      await db.$transaction(async tx => {
        await ownLease(tx, job);
        const changed = await tx.$executeRaw`UPDATE "SixflTvRenderPart" SET "stored"=true WHERE "jobId"=${job.id} AND "partNumber"=${partNumber} AND "sha256"=${digest} AND "objectKey"=${key}`;
        if (changed !== 1) throw new Error("Render manifest changed during upload.");
      });
      parts.push({ partNumber, objectKey: key, sha256: digest, sizeBytes: bytes.length, stored: true });
      position += bytes.length; partNumber++;
    }
  } finally { await handle.close(); }
  return { sizeBytes: position, partCount: partNumber, parts };
}
async function finishOutput(job: Job, proof: OutputProof, durationMs: number) {
  await db.$transaction(async tx => {
    await ownLease(tx, job);
    const rows = await tx.$queryRaw<RenderPart[]>`SELECT "partNumber","objectKey","sha256","sizeBytes","stored" FROM "SixflTvRenderPart" WHERE "jobId"=${job.id} ORDER BY "partNumber"`;
    if (!proof.partCount || rows.length !== proof.partCount || rows.some((part, index) => {
      const expected = proof.parts[index];
      return !expected || !part.stored || part.partNumber !== index || part.sizeBytes !== expected.sizeBytes || part.sha256 !== expected.sha256 || part.objectKey !== expected.objectKey;
    }) || rows.reduce((sum, part) => sum + part.sizeBytes, 0) !== proof.sizeBytes) throw new Error("Render verification failed; no finished preview was published.");
    const readyProgress = JSON.stringify({ progressPercent: 100, progressLabel: "Ready" });
    const changed = await tx.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='READY',"outputSizeBytes"=${proof.sizeBytes},"partCount"=${proof.partCount},"durationMs"=${durationMs},"completedAt"=NOW(),"busyUntil"=NULL,"leaseToken"=NULL,"updatedAt"=NOW(),"error"=NULL,"metadataJson"="metadataJson" || ${readyProgress}::jsonb WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken} AND "state"='PROCESSING' AND "busyUntil">NOW()`;
    if (changed !== 1) throw new Error("Render ownership expired before completion.");
  });
}
async function processJob(job: Job) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Render time limit reached.")), MAX_RENDER_MS);
  timer.unref();
  let refreshing = false;
  let progressPercent = 3;
  let progressLabel = "Starting render";
  const reportProgress: RenderProgressReporter = (percent, label) => {
    if (!Number.isFinite(percent)) return;
    progressPercent = Math.max(progressPercent, Math.max(1, Math.min(99, Math.round(percent))));
    progressLabel = safeError(label).slice(0, 80);
  };
  const saveHeartbeat = async () => {
    const progressJson = JSON.stringify({ progressPercent, progressLabel });
    return db.$executeRaw`UPDATE "SixflTvRenderJob" SET "busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW(),"metadataJson"="metadataJson" || ${progressJson}::jsonb WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken} AND "state"='PROCESSING' AND "busyUntil">NOW()`;
  };
  const heartbeat = setInterval(async () => {
    if (refreshing || controller.signal.aborted) return;
    refreshing = true;
    try {
      const changed = await saveHeartbeat();
      if (changed !== 1) controller.abort(new Error("Render ownership expired."));
    } catch { controller.abort(new Error("Render ownership could not be renewed.")); }
    finally { refreshing = false; }
  }, RENDER_HEARTBEAT_MS);
  heartbeat.unref();
  try { await renderSignals.run(controller.signal, async () => {
    await db.$transaction(tx => ownLease(tx, job));
    await saveHeartbeat();
    await renderJob(job, reportProgress);
  }); }
  finally { clearTimeout(timer); clearInterval(heartbeat); }
}

async function renderJob(job: Job, reportProgress: RenderProgressReporter) {
  const metadata = job.metadataJson as unknown as Metadata;
  if (!metadata?.fixture?.firstTeam?.name || !metadata?.fixture?.secondTeam?.name) throw new Error("Render metadata is incomplete.");
  reportProgress(5, "Loading source footage");
  const inputs = await loadInputs(job.id);
  if (inputs.reduce((sum, input) => sum + input.sizeBytes, 0n) > 12n * 1024n ** 3n) throw new Error("Selected source footage exceeds the 12 GiB processing limit.");
  if (!inputs.some(input => input.role === "CONTENT")) throw new Error("No content source is attached to this render job.");
  const dir = await mkdtemp(path.join(os.tmpdir(), `sixfl-tv-${job.id}-`));
  try {
    await mkdir(path.join(dir, "source")); await mkdir(path.join(dir, "normalised"));
    reportProgress(7, "Creating broadcast graphics");
    const titlePng = path.join(dir, "title.png"), goalOfMonthPng = path.join(dir, "goal-of-month.png");
    const leagueTopPng = path.join(dir, "league-table-top.png"), leagueBottomPng = path.join(dir, "league-table-bottom.png");
    const lineupPng = path.join(dir, "lineup.png"), footageOverlayPng = path.join(dir, job.kind === "HIGHLIGHTS" ? "score-bug.png" : "watermark.png");
    await writeFile(titlePng, await createSixflTvVideoCard({ fixture: metadata.fixture, mode: "TITLE", label: metadata.label, siteUrl: siteUrl() }));
    await writeFile(goalOfMonthPng, await createSixflTvGoalOfMonthCard({ siteUrl: siteUrl(), fixture: metadata.fixture }));
    const [lineupBytes, leagueTopBytes, leagueBottomBytes] = await Promise.all([
      createSixflTvLineupCard({ fixture: metadata.fixture, siteUrl: siteUrl() }),
      createSixflTvLeagueTableCard({ fixture: metadata.fixture, page: "TOP", siteUrl: siteUrl() }),
      createSixflTvLeagueTableCard({ fixture: metadata.fixture, page: "BOTTOM", siteUrl: siteUrl() }),
    ]);
    if (lineupBytes) await writeFile(lineupPng, lineupBytes);
    if (leagueTopBytes) await writeFile(leagueTopPng, leagueTopBytes);
    if (leagueBottomBytes) await writeFile(leagueBottomPng, leagueBottomBytes);
    await writeFile(footageOverlayPng, await createSixflTvScoreBug({ fixture: metadata.fixture, kind: job.kind, siteUrl: siteUrl() }));
    reportProgress(10, "Preparing video segments");
    const segments: string[] = [];
    const intro = inputs.filter(input => input.role === "INTRO"), content = inputs.filter(input => input.role === "CONTENT"), outro = inputs.filter(input => input.role === "OUTRO");
    const mediaInputs = [...intro, ...content, ...outro];
    const totalMediaBytes = Math.max(1, mediaInputs.reduce((sum, input) => sum + Number(input.sizeBytes), 0));
    let completedMediaBytes = 0;
    let bestPoster: PosterCandidate | null = null;
    const existingPoster = job.kind === "FULL_MATCH" ? await thumbnailBackgroundExists(job.fixtureId) : false;
    const collectPosterFor = (contentIndex: number) =>
      job.kind === "HIGHLIGHTS" ? contentIndex < 2 : !existingPoster && contentIndex === 0;

    const normaliseInput = async (
      input: Input,
      source: string,
      normal: string,
      overlay: string | undefined,
      label: string,
      posterLabel?: string,
      goalClipPosterAssetId?: string,
    ) => {
      const mediaBytes = Math.max(1, Number(input.sizeBytes));
      const mediaStartBytes = completedMediaBytes;
      const progressFor = (fraction: number) =>
        12 + ((mediaStartBytes + mediaBytes * Math.max(0, Math.min(1, fraction))) / totalMediaBytes) * 70;
      reportProgress(progressFor(0), `Preparing ${label}`);
      await reconstructAsset(input, source);
      if (posterLabel || goalClipPosterAssetId) {
        const candidate = await sourcePosterCandidate(source, dir, posterLabel || `goal-clip-${goalClipPosterAssetId}`);
        if (goalClipPosterAssetId) {
          await saveGoalClipPoster(goalClipPosterAssetId, candidate).catch(error =>
            console.warn(`Could not save Goal of the Month poster for ${goalClipPosterAssetId}: ${safeError(error)}`),
          );
        }
        if (posterLabel && candidate && (!bestPoster || candidate.score > bestPoster.score)) bestPoster = candidate;
      }
      reportProgress(progressFor(0.02), label);
      await normaliseVideo(source, normal, overlay, fraction => reportProgress(progressFor(fraction), label));
      completedMediaBytes = mediaStartBytes + mediaBytes;
      reportProgress(progressFor(1), label);
    };
    let segmentIndex = 0;
    for (const input of intro) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await normaliseInput(input, source, normal, undefined, "Rendering intro"); segments.push(normal);
    }
    const swipe = content.length ? path.join(dir, "normalised", "swipe.mp4") : null;
    if (swipe) await swipeVideo(dir, swipe);

    const title = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(titlePng, title, TITLE_SECONDS); segments.push(title);
    if (lineupBytes) {
      if (swipe) segments.push(swipe);
      const lineup = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(lineupPng, lineup, LINEUP_SECONDS); segments.push(lineup);
    }
    if (swipe) segments.push(swipe);
    for (let index = 0; index < content.length; index++) {
      if (index > 0 && swipe) segments.push(swipe);
      const input = content[index];
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      const numberedClip = job.kind === "HIGHLIGHTS" && input.kind === "CLIP";
      const clipOverlay = numberedClip
        ? path.join(dir, "normalised", `score-bug-clip-${input.clipNumber ?? index + 1}.png`)
        : footageOverlayPng;
      if (numberedClip) {
        await writeFile(clipOverlay, await createSixflTvScoreBug({
          fixture: metadata.fixture,
          kind: job.kind,
          siteUrl: siteUrl(),
          clipNumber: input.clipNumber ?? index + 1,
        }));
      }
      await normaliseInput(
        input,
        source,
        normal,
        clipOverlay,
        job.kind === "FULL_MATCH" ? "Rendering full match" : `Rendering highlight clip ${index + 1} of ${content.length}`,
        collectPosterFor(index) ? `${job.kind.toLowerCase()}-${index + 1}` : undefined,
        numberedClip ? input.assetId : undefined,
      );
      segments.push(normal);
    }
    if (bestPoster) {
      reportProgress(83, "Choosing thumbnail action frame");
      await saveThumbnailBackground(job.fixtureId, bestPoster).catch(error =>
        console.warn(`Could not save thumbnail action frame: ${safeError(error)}`),
      );
    }
    if (swipe) segments.push(swipe);
    reportProgress(84, "Adding Goal of the Month card");
    const goalOfMonthEnd = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
    await cardVideo(goalOfMonthPng, goalOfMonthEnd, GOAL_OF_MONTH_END_SECONDS); segments.push(goalOfMonthEnd);

    const tableRows = metadata.fixture.leagueTable?.rows || [];
    const tableMidpoint = Math.ceil(tableRows.length / 2);
    const firstTableIndex = tableRows.findIndex(row => row.teamName.toLowerCase() === metadata.fixture.firstTeam.name.toLowerCase());
    const secondTableIndex = tableRows.findIndex(row => row.teamName.toLowerCase() === metadata.fixture.secondTeam.name.toLowerCase());
    const showTopHalf = [firstTableIndex, secondTableIndex].some(index => index >= 0 && index < tableMidpoint);
    const showBottomHalf = [firstTableIndex, secondTableIndex].some(index => index >= tableMidpoint);

    if (leagueTopBytes && showTopHalf) {
      if (swipe) segments.push(swipe);
      reportProgress(87, "Adding relevant top-half league table");
      const leagueTop = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await cardVideo(leagueTopPng, leagueTop, LEAGUE_TABLE_SECONDS); segments.push(leagueTop);
    }
    if (leagueBottomBytes && showBottomHalf) {
      if (swipe) segments.push(swipe);
      reportProgress(89, "Adding relevant bottom-half league table");
      const leagueBottom = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await cardVideo(leagueBottomPng, leagueBottom, LEAGUE_TABLE_SECONDS); segments.push(leagueBottom);
    }

    for (const input of outro) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await normaliseInput(input, source, normal, undefined, "Rendering outro"); segments.push(normal);
    }
    console.log(`Render assembly ${job.id}: customIntro=${intro.length} titleCard=1 lineupCard=${lineupBytes ? 1 : 0} predictorOnLineup=${metadata.fixture.predictor ? 1 : 0} content=${content.length} slowSwipeSeconds=${(SWIPE_FRAMES / SWIPE_FPS).toFixed(1)} resultCard=0 goalOfMonthAfterFootage=1 relevantTopHalf=${leagueTopBytes && showTopHalf ? 1 : 0} relevantBottomHalf=${leagueBottomBytes && showBottomHalf ? 1 : 0} outro=${outro.length} footageOverlay=${job.kind === "HIGHLIGHTS" ? "FT+match-highlights" : "FT+full-match"} thumbnailFrame=${bestPoster ? bestPoster.source : existingPoster ? "existing" : "fallback"} renderVersion=${metadata.renderVersion ?? 1}`);
    const concat = path.join(dir, "concat.txt");
    await writeFile(concat, segments.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
    const output = path.join(dir, "output.mp4");
    reportProgress(92, "Assembling finished video");
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", output]);
    reportProgress(95, "Verifying finished video");
    const durationMs = Math.round((await durationSeconds(output)) * 1000);
    reportProgress(97, "Saving preview");
    const stored = await storeOutput(job, output);
    reportProgress(99, "Finalising preview");
    await finishOutput(job, stored, durationMs);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function tokenKey() { return createHash("sha256").update(required("SIXFL_TV_TOKEN_KEY")).digest(); }
function b64(value: string) { return Buffer.from(value, "base64url"); }
function decryptRefreshToken(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Stored YouTube authorisation is not supported.");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), b64(parts[1]));
  decipher.setAuthTag(b64(parts[2]));
  return Buffer.concat([decipher.update(b64(parts[3])), decipher.final()]).toString("utf8");
}
type YoutubeAuth = { accessToken: string; scope: string };
const YOUTUBE_DELETE_SCOPES = new Set([
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtubepartner",
]);
function canDeleteYoutubeVideos(scope: string) {
  return scope.split(/\s+/).some(value => YOUTUBE_DELETE_SCOPES.has(value));
}
async function youtubeAccessToken(): Promise<YoutubeAuth> {
  const rows = await db.$queryRaw<{ refreshTokenCiphertext: string; scope: string }[]>`SELECT "refreshTokenCiphertext","scope" FROM "SixflTvYoutubeConnection" WHERE "id"='primary'`;
  if (!rows[0]) throw new Error("SIXFL YouTube is not connected.");
  const body = new URLSearchParams({ client_id: required("YOUTUBE_CLIENT_ID"), client_secret: required("YOUTUBE_CLIENT_SECRET"), refresh_token: decryptRefreshToken(rows[0].refreshTokenCiphertext), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google access token refresh failed.");
  return { accessToken: data.access_token, scope: rows[0].scope || "" };
}
async function deleteYoutubeVideo(videoId: string, accessToken: string) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) });
  if (response.ok || response.status === 404) return;
  const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
  throw new Error(detail.error?.message || `YouTube replacement cleanup failed (${response.status}).`);
}

async function claimPublishJob() {
  return db.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='QUEUED',"busyUntil"=NULL,"updatedAt"=NOW(),"error"='Recovered after an interrupted worker.' WHERE "state"='PROCESSING' AND "busyUntil" < NOW()`;
    const rows = await tx.$queryRaw<PublishJob[]>`
      SELECT "id","fixtureId","kind","renderJobId","thumbnailObjectKey","title","description","privacyStatus","resumableUrl","uploadedBytes","youtubeVideoId","youtubeUrl","notifySubscribers","notificationDay"
      FROM "SixflTvYoutubePublish" WHERE "state"='QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    await tx.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='PROCESSING',"busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW(),"error"=NULL WHERE "id"=${rows[0].id}`;
    return rows[0];
  });
}

async function renderPartsForPublish(job: PublishJob) {
  const renders = await db.$queryRaw<{ outputSizeBytes: bigint | null; partCount: number | null; state: string }[]>`
    SELECT "outputSizeBytes","partCount","state" FROM "SixflTvRenderJob" WHERE "id"=${job.renderJobId} AND "fixtureId"=${job.fixtureId} AND "kind"=${job.kind}`;
  const render = renders[0];
  if (!render || render.state !== "READY" || render.outputSizeBytes == null || render.partCount == null) throw new Error("Approved rendered video is no longer ready.");
  const parts = await db.$queryRaw<RenderPart[]>`SELECT "partNumber","objectKey","sizeBytes","stored","sha256" FROM "SixflTvRenderPart" WHERE "jobId"=${job.renderJobId} ORDER BY "partNumber"`;
  if (parts.length !== render.partCount || parts.some((part, index) => part.partNumber !== index || !part.stored)) throw new Error("Approved rendered video storage is incomplete.");
  return { total: Number(render.outputSizeBytes), parts };
}

async function assignYoutubeSubscriberNotification(job: PublishJob) {
  if (job.notifySubscribers !== null && job.notificationDay) return job.notifySubscribers;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424423)::text`;
    const current = await tx.$queryRaw<Array<{ notifySubscribers: boolean | null; notificationDay: Date | null }>>`
      SELECT "notifySubscribers","notificationDay"
      FROM "SixflTvYoutubePublish"
      WHERE "id"=${job.id}
      FOR UPDATE`;
    if (!current[0]) throw new Error("YouTube publish job no longer exists.");
    if (current[0].notifySubscribers !== null && current[0].notificationDay) {
      job.notifySubscribers = current[0].notifySubscribers;
      job.notificationDay = current[0].notificationDay;
      return current[0].notifySubscribers;
    }

    const status = await tx.$queryRaw<Array<{ day: string; claimed: boolean }>>`
      SELECT
        (NOW() AT TIME ZONE 'Europe/London')::date::text AS day,
        EXISTS(
          SELECT 1
          FROM "SixflTvYoutubePublish"
          WHERE "notifySubscribers" IS TRUE
            AND "notificationDay"=(NOW() AT TIME ZONE 'Europe/London')::date
            AND "id" <>${job.id}
        ) AS claimed`;
    const day = status[0]?.day;
    if (!day) throw new Error("Could not determine the SIXFL TV notification day.");
    const notify = !Boolean(status[0]?.claimed);
    await tx.$executeRaw`
      UPDATE "SixflTvYoutubePublish"
      SET "notifySubscribers"=${notify},"notificationDay"=${day}::date,"updatedAt"=NOW()
      WHERE "id"=${job.id}`;
    job.notifySubscribers = notify;
    job.notificationDay = day;
    return notify;
  });
}

async function startYoutubeResumable(job: PublishJob, accessToken: string, total: number) {
  const notifySubscribers = await assignYoutubeSubscriberNotification(job);
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/videos");
  url.searchParams.set("uploadType", "resumable"); url.searchParams.set("part", "snippet,status"); url.searchParams.set("notifySubscribers", notifySubscribers ? "true" : "false");
  console.log(`YouTube subscriber notification for ${job.id}: ${notifySubscribers ? "ON" : "OFF"}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(total), "X-Upload-Content-Type": "video/mp4" },
    body: JSON.stringify({ snippet: { title: job.title, description: job.description, categoryId: "17" }, status: { privacyStatus: job.privacyStatus } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(detail.error?.message || `YouTube upload session failed (${response.status}).`);
  }
  const location = response.headers.get("location");
  if (!location) throw new Error("YouTube did not return a resumable upload session.");
  await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "resumableUrl"=${location},"uploadedBytes"=0,"busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id}`;
  job.resumableUrl = location; job.uploadedBytes = 0n;
}

function acknowledgedOffset(response: Response) {
  const range = response.headers.get("range");
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  return match ? Number(match[1]) + 1 : 0;
}
async function queryYoutubeUpload(job: PublishJob, accessToken: string, total: number) {
  if (!job.resumableUrl) return { offset: Number(job.uploadedBytes), videoId: job.youtubeVideoId };
  const response = await fetch(job.resumableUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Length": "0", "Content-Range": `bytes */${total}` }, signal: AbortSignal.timeout(30000) });
  if (response.status === 308) return { offset: acknowledgedOffset(response), videoId: null };
  if (response.ok) {
    const data = await response.json().catch(() => ({})) as { id?: string };
    return { offset: total, videoId: data.id || job.youtubeVideoId };
  }
  if (response.status === 404 || response.status === 410) return { offset: 0, videoId: null, expired: true };
  const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
  throw new Error(detail.error?.message || `YouTube upload status failed (${response.status}).`);
}

async function uploadRenderToYoutube(job: PublishJob, accessToken: string) {
  const { total, parts } = await renderPartsForPublish(job);
  if (job.youtubeVideoId) return job.youtubeVideoId;
  if (!job.resumableUrl) await startYoutubeResumable(job, accessToken, total);
  let status = await queryYoutubeUpload(job, accessToken, total);
  if (status.expired) {
    job.resumableUrl = null; job.uploadedBytes = 0n;
    await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "resumableUrl"=NULL,"uploadedBytes"=0,"updatedAt"=NOW() WHERE "id"=${job.id}`;
    await startYoutubeResumable(job, accessToken, total);
    status = { offset: 0, videoId: null };
  }
  if (status.videoId) return status.videoId;
  let offset = Math.max(0, Math.min(total, status.offset));
  for (const part of parts) {
    const partStart = part.partNumber * PART_BYTES, partEnd = partStart + part.sizeBytes;
    if (offset >= partEnd) continue;
    if (offset < partStart) throw new Error("YouTube resumable offset does not match stored render parts.");
    const response = await fetchRailwayObject({ key: part.objectKey, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error("Rendered video storage is unavailable during YouTube upload.");
    const full = Buffer.from(await response.arrayBuffer());
    if (full.length !== part.sizeBytes) throw new Error("Rendered video part length changed before YouTube upload.");
    let cursor = offset - partStart;
    while (cursor < full.length) {
      const body = full.subarray(cursor, Math.min(full.length, cursor + YOUTUBE_UPLOAD_CHUNK_BYTES));
      const chunkStart = partStart + cursor;
      const end = chunkStart + body.length - 1;
      const startedAt = Date.now();
      const upload = await fetch(job.resumableUrl!, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "video/mp4",
          "Content-Length": String(body.length),
          "Content-Range": `bytes ${chunkStart}-${end}/${total}`,
        },
        body,
        signal: AbortSignal.timeout(120000),
      });
      if (upload.status === 308) {
        const acknowledged = acknowledgedOffset(upload);
        if (acknowledged <= chunkStart || acknowledged > total) throw new Error("YouTube resumable upload returned an invalid offset.");
        offset = acknowledged;
        cursor = Math.max(0, offset - partStart);
      } else if (upload.ok) {
        const data = await upload.json().catch(() => ({})) as { id?: string };
        if (!data.id) throw new Error("YouTube completed the upload without returning a video ID.");
        await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "uploadedBytes"=${total},"youtubeVideoId"=${data.id},"updatedAt"=NOW() WHERE "id"=${job.id}`;
        return data.id;
      } else {
        const detail = await upload.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(detail.error?.message || `YouTube video upload failed (${upload.status}).`);
      }

      // Smooth YouTube egress so publishing cannot monopolise project networking.
      // Rendering stays fast; only the background YouTube transfer is paced.
      const minimumMs = Math.ceil(body.length / YOUTUBE_UPLOAD_BYTES_PER_SECOND * 1000);
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs < minimumMs) await sleep(minimumMs - elapsedMs);
      if (offset >= partEnd) break;
    }
    await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "uploadedBytes"=${offset},"busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id}`;
  }
  status = await queryYoutubeUpload(job, accessToken, total);
  if (!status.videoId) throw new Error("YouTube upload did not reach a completed state.");
  await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "uploadedBytes"=${total},"youtubeVideoId"=${status.videoId},"updatedAt"=NOW() WHERE "id"=${job.id}`;
  return status.videoId;
}

async function setYoutubeThumbnail(job: PublishJob, videoId: string, accessToken: string) {
  const response = await fetchRailwayObject({ key: job.thumbnailObjectKey, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Approved thumbnail storage is unavailable.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error("Approved thumbnail size is invalid.");
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/thumbnails/set");
  url.searchParams.set("videoId", videoId); url.searchParams.set("uploadType", "media");
  const upload = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png", "Content-Length": String(bytes.length) }, body: bytes, signal: AbortSignal.timeout(60000) });
  if (!upload.ok) {
    const detail = await upload.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(detail.error?.message || `YouTube thumbnail upload failed (${upload.status}).`);
  }
}

async function saveYoutubeFixtureLink(job: PublishJob, youtubeUrl: string) {
  await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ sixflTvUrl: string | null }[]>`SELECT "sixflTvUrl" FROM "Fixture" WHERE "id"=${job.fixtureId} FOR UPDATE`;
    if (!rows[0]) throw new Error("Fixture no longer exists while saving YouTube link.");
    const existing = parseSixflTvVideoValue(rows[0].sixflTvUrl);
    const built = buildSixflTvVideoValue({
      highlights: job.kind === "HIGHLIGHTS" ? youtubeUrl : existing.highlights,
      fullMatch: job.kind === "FULL_MATCH" ? youtubeUrl : existing.fullMatch,
      extras: existing.extras,
    });
    if (!built.ok) throw new Error("Existing SIXFL TV links are invalid; fixture link was not changed.");
    await tx.$executeRaw`UPDATE "Fixture" SET "sixflTvUrl"=${built.value},"sixflTvRecorded"=true,"updatedAt"=NOW() WHERE "id"=${job.fixtureId}`;
  });
}

async function cleanupOlderYoutubeCopies(job: PublishJob, keepVideoId: string, auth: YoutubeAuth) {
  if (!canDeleteYoutubeVideos(auth.scope)) {
    console.warn("YouTube replacement cleanup is waiting for the channel to be reconnected with video-management permission.");
    return 0;
  }
  const older = await db.$queryRaw<Array<{ id: string; youtubeVideoId: string }>>(Prisma.sql`
    SELECT "id","youtubeVideoId"
    FROM "SixflTvYoutubePublish"
    WHERE "fixtureId"=${job.fixtureId}
      AND "kind"=${job.kind}
      AND "id"<>${job.id}
      AND "state"='READY'
      AND "youtubeVideoId" IS NOT NULL
      AND "youtubeVideoId"<>${keepVideoId}
    ORDER BY "completedAt" DESC NULLS LAST, "createdAt" DESC
  `);
  let deleted = 0;
  for (const old of older) {
    await deleteYoutubeVideo(old.youtubeVideoId, auth.accessToken);
    await db.$executeRaw`
      UPDATE "SixflTvYoutubePublish"
      SET "state"='FAILED',"error"='Superseded by a newer SIXFL TV publish and removed from YouTube.',"busyUntil"=NULL,"updatedAt"=NOW()
      WHERE "id"=${old.id} AND "state"='READY'`;
    deleted += 1;
    console.log(`Deleted superseded YouTube video ${old.youtubeVideoId} for ${job.kind} fixture ${job.fixtureId}.`);
  }
  return deleted;
}

async function processPublish(job: PublishJob) {
  const auth = await youtubeAccessToken();
  const videoId = await uploadRenderToYoutube(job, auth.accessToken);
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "youtubeVideoId"=${videoId},"youtubeUrl"=${youtubeUrl},"busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id}`;
  await setYoutubeThumbnail(job, videoId, auth.accessToken);
  await saveYoutubeFixtureLink(job, youtubeUrl);
  await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='READY',"youtubeVideoId"=${videoId},"youtubeUrl"=${youtubeUrl},"uploadedBytes"=(SELECT "outputSizeBytes" FROM "SixflTvRenderJob" WHERE "id"=${job.renderJobId}),"completedAt"=NOW(),"busyUntil"=NULL,"updatedAt"=NOW(),"error"=NULL WHERE "id"=${job.id}`;
  await cleanupOlderYoutubeCopies(job, videoId, auth).catch(error => console.error("YouTube replacement cleanup failed", safeError(error)));
}

async function cleanupOneSupersededYoutubeVideo() {
  const connection = await db.$queryRaw<Array<{ scope: string }>>`
    SELECT "scope" FROM "SixflTvYoutubeConnection" WHERE "id"='primary' LIMIT 1`;
  if (!connection[0] || !canDeleteYoutubeVideos(connection[0].scope || "")) return false;

  const candidates = await db.$queryRaw<Array<{
    id: string;
    fixtureId: string;
    kind: "HIGHLIGHTS" | "FULL_MATCH";
    youtubeVideoId: string;
    keepVideoId: string;
  }>>(Prisma.sql`
    WITH ranked AS (
      SELECT
        p."id",
        p."fixtureId",
        p."kind",
        p."youtubeVideoId",
        FIRST_VALUE(p."youtubeVideoId") OVER (
          PARTITION BY p."fixtureId", p."kind"
          ORDER BY p."completedAt" DESC NULLS LAST, p."createdAt" DESC, p."id" DESC
        ) AS "keepVideoId",
        ROW_NUMBER() OVER (
          PARTITION BY p."fixtureId", p."kind"
          ORDER BY p."completedAt" DESC NULLS LAST, p."createdAt" DESC, p."id" DESC
        ) AS rank
      FROM "SixflTvYoutubePublish" p
      WHERE p."state"='READY' AND p."youtubeVideoId" IS NOT NULL
    )
    SELECT "id","fixtureId","kind","youtubeVideoId","keepVideoId"
    FROM ranked
    WHERE rank > 1
    ORDER BY "fixtureId","kind","id"
    LIMIT 10
  `);
  if (!candidates.length) return false;

  const auth = await youtubeAccessToken();
  for (const candidate of candidates) {
    const fixture = await db.$queryRaw<Array<{ sixflTvUrl: string | null }>>`
      SELECT "sixflTvUrl" FROM "Fixture" WHERE "id"=${candidate.fixtureId} LIMIT 1`;
    if (!fixture[0]) continue;
    const current = parseSixflTvVideoValue(fixture[0].sixflTvUrl);
    const expected = `https://www.youtube.com/watch?v=${encodeURIComponent(candidate.keepVideoId)}`;
    const activeUrl = candidate.kind === "HIGHLIGHTS" ? current.highlights : current.fullMatch;
    if (activeUrl !== expected) {
      console.warn(`Skipped old YouTube cleanup for ${candidate.fixtureId} ${candidate.kind}: fixture does not point at newest published video.`);
      continue;
    }
    await deleteYoutubeVideo(candidate.youtubeVideoId, auth.accessToken);
    await db.$executeRaw`
      UPDATE "SixflTvYoutubePublish"
      SET "state"='FAILED',"error"='Superseded by a newer SIXFL TV publish and removed from YouTube.',"busyUntil"=NULL,"updatedAt"=NOW()
      WHERE "id"=${candidate.id} AND "state"='READY'`;
    console.log(`Retroactive cleanup deleted superseded YouTube video ${candidate.youtubeVideoId} for ${candidate.kind} fixture ${candidate.fixtureId}.`);
    return true;
  }
  return false;
}
type AutoPublishCandidate = {
  renderJobId: string;
  fixtureId: string;
  kind: "HIGHLIGHTS" | "FULL_MATCH";
  metadataJson: Prisma.JsonValue;
  kickoffAt: Date;
  leagueName: string;
  leagueSeason: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
};
type AutoThumbnailRow = {
  headline: string;
  strapline: string;
  showScore: boolean;
  objectKey: string;
};

async function autoThumbnailForPublish(candidate: AutoPublishCandidate) {
  const existing = await db.$queryRaw<AutoThumbnailRow[]>(Prisma.sql`
    SELECT "headline","strapline","showScore","objectKey"
    FROM "SixflTvThumbnail"
    WHERE "fixtureId"=${candidate.fixtureId} AND "kind"=${candidate.kind}
    LIMIT 1
  `);
  const metadata = candidate.metadataJson as unknown as Metadata;
  if (!metadata?.fixture?.firstTeam?.name || !metadata?.fixture?.secondTeam?.name) {
    throw new Error("Automatic YouTube publishing cannot create a thumbnail because render metadata is incomplete.");
  }
  const headline = existing[0]?.headline || (candidate.kind === "HIGHLIGHTS" ? "MATCH HIGHLIGHTS" : "FULL MATCH");
  const strapline = existing[0]?.strapline || candidate.leagueName;
  const showScore = existing[0]?.showScore ?? true;
  const backgroundResponse = await fetchRailwayObject({
    key: sixflTvThumbnailBackgroundKey(candidate.fixtureId),
    signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  const backgroundImage = backgroundResponse?.ok ? Buffer.from(await backgroundResponse.arrayBuffer()) : null;
  const bytes = await createSixflTvThumbnail({
    kind: candidate.kind,
    fixture: metadata.fixture,
    headline,
    strapline,
    showScore,
    siteUrl: siteUrl(),
    backgroundImage,
  });
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error("Automatic YouTube thumbnail size is invalid.");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const objectKey = `sixfl-tv-thumbnail/v1/${candidate.fixtureId}/${candidate.kind.toLowerCase()}/${randomUUID()}-${digest}.png`;
  await uploadRailwayObject({ key: objectKey, body: bytes, contentType: "image/png", signal: AbortSignal.timeout(30000) });
  const oldKey = existing[0]?.objectKey || null;
  try {
    await db.$executeRaw`
      INSERT INTO "SixflTvThumbnail" ("fixtureId","kind","headline","strapline","showScore","objectKey","sha256","sizeBytes","updatedByActor")
      VALUES (${candidate.fixtureId},${candidate.kind},${headline},${strapline},${showScore},${objectKey},${digest},${bytes.length},'automatic-youtube-publish')
      ON CONFLICT ("fixtureId","kind") DO UPDATE SET
        "headline"=EXCLUDED."headline",
        "strapline"=EXCLUDED."strapline",
        "showScore"=EXCLUDED."showScore",
        "objectKey"=EXCLUDED."objectKey",
        "sha256"=EXCLUDED."sha256",
        "sizeBytes"=EXCLUDED."sizeBytes",
        "updatedByActor"=EXCLUDED."updatedByActor",
        "updatedAt"=NOW()
    `;
  } catch (error) {
    await deleteRailwayObject(objectKey, AbortSignal.timeout(15000)).catch(() => undefined);
    throw error;
  }
  if (oldKey && oldKey !== objectKey) await deleteRailwayObject(oldKey, AbortSignal.timeout(15000)).catch(() => undefined);
  return objectKey;
}

async function queueAutomaticYoutubePublish() {
  const connection = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "SixflTvYoutubeConnection" WHERE "id"='primary' LIMIT 1
  `;
  if (!connection[0]) return false;

  const rows = await db.$queryRaw<AutoPublishCandidate[]>(Prisma.sql`
    WITH latest_ready AS (
      SELECT DISTINCT ON (r."fixtureId", r."kind")
        r."id" AS "renderJobId",
        r."fixtureId",
        r."kind",
        r."metadataJson",
        r."createdAt"
      FROM "SixflTvRenderJob" r
      WHERE r."state"='READY'
        AND r."createdAt" >= NOW() - INTERVAL '7 days'
      ORDER BY r."fixtureId", r."kind", r."createdAt" DESC, r."id" DESC
    )
    SELECT
      r."renderJobId",
      r."fixtureId",
      r."kind",
      r."metadataJson",
      f."kickoffAt",
      l."name" AS "leagueName",
      l."season" AS "leagueSeason",
      home."name" AS "homeTeamName",
      away."name" AS "awayTeamName",
      mr."homeScore",
      mr."awayScore"
    FROM latest_ready r
    JOIN "Fixture" f ON f."id"=r."fixtureId"
    JOIN "League" l ON l."id"=f."leagueId"
    JOIN "Team" home ON home."id"=f."homeTeamId"
    JOIN "Team" away ON away."id"=f."awayTeamId"
    JOIN "MatchResult" mr ON mr."fixtureId"=f."id"
    WHERE mr."isDisputed"=FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM "SixflTvYoutubePublish" p
        WHERE p."fixtureId"=r."fixtureId" AND p."kind"=r."kind"
      )
    ORDER BY r."createdAt"
    LIMIT 1
  `);
  const candidate = rows[0];
  if (!candidate) return false;

  const thumbnailObjectKey = await autoThumbnailForPublish(candidate);
  const defaults = sixflTvYoutubeDefaults({
    kickoffAt: candidate.kickoffAt,
    league: { name: candidate.leagueName, season: candidate.leagueSeason },
    homeTeam: { name: candidate.homeTeamName },
    awayTeam: { name: candidate.awayTeamName },
    result: { homeScore: candidate.homeScore, awayScore: candidate.awayScore },
  }, candidate.kind);

  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424424)::text`;
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "SixflTvYoutubePublish"
      WHERE "fixtureId"=${candidate.fixtureId} AND "kind"=${candidate.kind}
      LIMIT 1
      FOR UPDATE
    `;
    if (existing[0]) return;
    await tx.$executeRaw`
      INSERT INTO "SixflTvYoutubePublish"
        ("id","fixtureId","kind","renderJobId","thumbnailObjectKey","title","description","privacyStatus","requestedByActor")
      VALUES
        (${randomUUID()},${candidate.fixtureId},${candidate.kind},${candidate.renderJobId},${thumbnailObjectKey},${defaults.title},${defaults.description},'public','automatic-youtube-publish')
    `;
  });
  console.log(`Automatically queued ${candidate.kind} for fixture ${candidate.fixtureId} to public YouTube.`);
  return true;
}

type RetentionAsset = { id: string; fixtureId: string; filename: string; kind: string };
type RetentionPart = { assetId: string; partNumber: number; objectKey: string };

async function cleanupMaturedGoalOfMonthFootage() {
  const latestClosedMonth = monthlyCycle(new Date()).latestClosedMonth;
  const assets = await db.$queryRaw<RetentionAsset[]>(Prisma.sql`
    SELECT a."id", a."fixtureId", a."filename", a."kind"
    FROM "SixflTvFootageAsset" a
    JOIN "Fixture" f ON f."id"=a."fixtureId"
    WHERE a."fixtureId" IS NOT NULL
      AND a."state" IN ('READY','DELETING')
      AND to_char(f."kickoffAt" AT TIME ZONE 'Europe/London','YYYY-MM') <= ${latestClosedMonth}
      AND NOT EXISTS (
        SELECT 1
        FROM "SixflTvRenderJob" r
        WHERE r."fixtureId"=a."fixtureId" AND r."state" IN ('QUEUED','PROCESSING')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "SixflTvFootageAsset" pending
        WHERE pending."fixtureId"=a."fixtureId" AND pending."state"='UPLOADING'
      )
      AND (
        (a."kind" IN ('CLIP','HIGHLIGHTS') AND EXISTS (
          SELECT 1 FROM "SixflTvYoutubePublish" p
          WHERE p."fixtureId"=a."fixtureId" AND p."kind"='HIGHLIGHTS' AND p."state"='READY' AND p."youtubeVideoId" IS NOT NULL
        ))
        OR
        (a."kind"='FULL_MATCH' AND EXISTS (
          SELECT 1 FROM "SixflTvYoutubePublish" p
          WHERE p."fixtureId"=a."fixtureId" AND p."kind"='FULL_MATCH' AND p."state"='READY' AND p."youtubeVideoId" IS NOT NULL
        ))
      )
    ORDER BY f."kickoffAt", a."createdAt", a."id"
    LIMIT 1
  `);
  const asset = assets[0];
  if (!asset) return false;

  await db.$executeRaw`
    UPDATE "SixflTvFootageAsset"
    SET "state"='DELETING',"updatedAt"=NOW()
    WHERE "id"=${asset.id} AND "state" IN ('READY','DELETING')`;

  const parts = await db.$queryRaw<RetentionPart[]>(Prisma.sql`
    SELECT "assetId","partNumber","objectKey"
    FROM "SixflTvFootagePart"
    WHERE "assetId"=${asset.id}
    ORDER BY "partNumber"
    LIMIT ${RETENTION_DELETE_PARTS_PER_SWEEP}
  `);

  for (const part of parts) {
    await deleteRailwayObject(part.objectKey, AbortSignal.timeout(15000));
    await db.$executeRaw`
      DELETE FROM "SixflTvFootagePart"
      WHERE "assetId"=${part.assetId} AND "partNumber"=${part.partNumber}`;
  }

  const remaining = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM "SixflTvFootagePart" WHERE "assetId"=${asset.id}
  `);
  const remainingParts = Number(remaining[0]?.count || 0n);
  if (!remainingParts) {
    await db.$executeRaw`
      UPDATE "SixflTvFootageAsset"
      SET "state"='DELETED',"leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW()
      WHERE "id"=${asset.id} AND "state"='DELETING'`;
    console.log(`Retention cleanup deleted ${asset.kind} source ${asset.filename} for fixture ${asset.fixtureId}; Goal of the Month month ${latestClosedMonth} or earlier is settled.`);
  } else {
    console.log(`Retention cleanup removed ${parts.length} parts from ${asset.filename}; ${remainingParts} remain.`);
  }
  return true;
}

async function main() {
  console.log("SIXFL TV worker ready");
  let nextRetentionSweepAt = Date.now() + 60_000;
  let nextYoutubeReplacementSweepAt = Date.now() + 15_000;
  while (!shutdown.signal.aborted) {
    const job = await claimJob().catch(error => { console.error("Render claim failed", safeError(error)); return null; });
    if (job) {
      try { await processJob(job); console.log(`Rendered ${job.kind} ${job.id}`); }
      catch (error) {
        const message = safeError(error); console.error(`Render ${job.id} failed`, message);
        await failJob(job, message).catch(() => undefined);
      }
      continue;
    }
    await queueAutomaticYoutubePublish().catch(error => console.error("Automatic YouTube queue failed", safeError(error)));
    const publish = await claimPublishJob().catch(error => { console.error("YouTube claim failed", safeError(error)); return null; });
    if (publish) {
      try { await processPublish(publish); console.log(`Published ${publish.kind} ${publish.id} to YouTube as ${publish.privacyStatus}`); }
      catch (error) {
        const message = safeError(error); console.error(`YouTube publish ${publish.id} failed`, message);
        await db.$executeRaw`
          UPDATE "SixflTvYoutubePublish"
          SET "state"='FAILED',
              "error"=${message},
              "busyUntil"=NULL,
              "notifySubscribers"=CASE WHEN "youtubeVideoId" IS NULL THEN NULL ELSE "notifySubscribers" END,
              "notificationDay"=CASE WHEN "youtubeVideoId" IS NULL THEN NULL ELSE "notificationDay" END,
              "updatedAt"=NOW()
          WHERE "id"=${publish.id}`.catch(() => undefined);
      }
      continue;
    }
    if (Date.now() >= nextYoutubeReplacementSweepAt) {
      try {
        const cleaned = await cleanupOneSupersededYoutubeVideo();
        nextYoutubeReplacementSweepAt = Date.now() + (cleaned ? 5_000 : 60_000);
      } catch (error) {
        console.error("YouTube replacement sweep failed", safeError(error));
        nextYoutubeReplacementSweepAt = Date.now() + 60_000;
      }
    }
    if (Date.now() >= nextRetentionSweepAt) {
      try {
        const cleaned = await cleanupMaturedGoalOfMonthFootage();
        nextRetentionSweepAt = Date.now() + (cleaned ? 60_000 : RETENTION_SWEEP_MS);
      } catch (error) {
        console.error("Retention cleanup failed", safeError(error));
        nextRetentionSweepAt = Date.now() + RETENTION_SWEEP_MS;
      }
    }
    await sleep(POLL_MS);
  }
}

// Importing the worker for isolated executable tests must never start its polling loop.
export { run, reconstructAsset, verifiedPart, storeOutput, finishOutput, processJob, failJob, renderSignals, swipeVideo, normaliseVideo, cleanupMaturedGoalOfMonthFootage, cleanupOneSupersededYoutubeVideo, queueAutomaticYoutubePublish };
if (process.argv[1] && /(?:^|[\\/])sixfl-tv-worker\.(?:ts|js)$/.test(process.argv[1])) {
  const stop = () => {
    if (shutdown.signal.aborted) return;
    shutdown.abort(new Error("Worker is stopping."));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  void main().catch(error => { console.error("SIXFL TV worker stopped", safeError(error)); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
