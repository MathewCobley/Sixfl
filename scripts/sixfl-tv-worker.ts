import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import sharp from "sharp";
import { Prisma, PrismaClient } from "@prisma/client";
import { createSixflTvGoalOfMonthCard, createSixflTvLineupCard, createSixflTvScoreBug, createSixflTvVideoCard, createSixflTvWatermark, type SixflTvGraphicFixture } from "../src/lib/sixfl-tv/graphics";
import { fetchRailwayObject, uploadRailwayObject } from "../src/lib/storage/railway-s3";
import { buildSixflTvVideoValue, parseSixflTvVideoValue } from "../src/lib/sixfl-tv/videos";

const db = new PrismaClient();
const PART_BYTES = 8 * 1024 * 1024;
const POLL_MS = 5000;
const renderSignals = new AsyncLocalStorage<AbortSignal>();
const shutdown = new AbortController();
const MAX_RENDER_MS = 2 * 60 * 60 * 1000;
const MAX_OUTPUT_BYTES = 16 * 1024 ** 3;
const TITLE_SECONDS = 4;
const LINEUP_SECONDS = 5;
const RESULT_SECONDS = 6;
const GOAL_OF_MONTH_END_SECONDS = 5;
const SWIPE_FRAMES = 12;
const SWIPE_FPS = 30;
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
type Input = { assetId: string; role: "INTRO" | "CONTENT" | "OUTRO"; position: number; filename: string; partCount: number; sizeBytes: bigint; state: string };
type SourcePart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean; sha256: string };
type RenderPart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean; sha256: string };
type PublishJob = {
  id: string; fixtureId: string; kind: "HIGHLIGHTS" | "FULL_MATCH"; renderJobId: string; thumbnailObjectKey: string;
  title: string; description: string; privacyStatus: "private"; resumableUrl: string | null; uploadedBytes: bigint;
  youtubeVideoId: string | null; youtubeUrl: string | null;
};
type Metadata = { fixture: SixflTvGraphicFixture; label: string; contentAssetIds: string[]; renderVersion?: number };

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

async function run(bin: string, args: string[], capture = false, timeoutMs = bin === "ffprobe" ? 60000 : MAX_RENDER_MS) {
  const signal = operationSignal(timeoutMs);
  signal.throwIfAborted();
  // Media inputs must stay local. Bound decoder, filter and encoder threads.
  const command = bin === "ffmpeg"
    ? ["-nostdin", "-protocol_whitelist", "file,pipe", "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1", ...args.slice(0, -1), "-threads", "2", args.at(-1)!]
    : bin === "ffprobe" ? ["-protocol_whitelist", "file,pipe", ...args] : args;
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, command, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let stdout = "", stderr = "", failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      failure = new Error("Video operation was cancelled or exceeded its time limit.");
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
    };
    signal.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", chunk => { stdout = (stdout + String(chunk)).slice(-65536); });
    child.stderr?.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-65536); });
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
    await tx.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='QUEUED',"leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW(),"error"='Recovered after an interrupted worker.' WHERE "state"='PROCESSING' AND "busyUntil" < NOW()`;
    const jobs = await tx.$queryRaw<Job[]>`SELECT "id","fixtureId","kind","metadataJson","leaseToken" FROM "SixflTvRenderJob" WHERE "state"='QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!jobs[0]) return null;
    const lease = randomUUID();
    await tx.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='PROCESSING',"leaseToken"=${lease},"busyUntil"=NOW()+INTERVAL '12 minutes',"startedAt"=COALESCE("startedAt",NOW()),"updatedAt"=NOW(),"error"=NULL WHERE "id"=${jobs[0].id}`;
    return { ...jobs[0], leaseToken: lease };
  });
}

async function loadInputs(jobId: string) {
  return db.$queryRaw<Input[]>`
    SELECT i."assetId",i."role",i."position",a."filename",a."partCount",a."sizeBytes",a."state"
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

async function normaliseVideo(source: string, target: string, scoreBug?: string) {
  const seconds = await durationSeconds(source), audio = await hasAudio(source);
  const fadeOutStart = Math.max(0, seconds - 0.18).toFixed(3);
  const base = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p`;
  const fade = `fade=t=in:st=0:d=0.18,fade=t=out:st=${fadeOutStart}:d=0.18`;
  const audioFilter = `aresample=48000,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOutStart}:d=0.12`;
  if (scoreBug) {
    const videoFilter = `[0:v]${base}[base];[1:v]format=rgba[bug];[base][bug]overlay=0:0:format=auto,${fade},format=yuv420p[v]`;
    if (audio) {
      await run("ffmpeg", ["-y", "-i", source, "-loop", "1", "-i", scoreBug, "-filter_complex", videoFilter,
        "-map", "[v]", "-map", "0:a:0", "-af", audioFilter, "-t", String(seconds), "-shortest",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
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
    const changed = await tx.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='READY',"outputSizeBytes"=${proof.sizeBytes},"partCount"=${proof.partCount},"durationMs"=${durationMs},"completedAt"=NOW(),"busyUntil"=NULL,"leaseToken"=NULL,"updatedAt"=NOW(),"error"=NULL WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken} AND "state"='PROCESSING' AND "busyUntil">NOW()`;
    if (changed !== 1) throw new Error("Render ownership expired before completion.");
  });
}
async function processJob(job: Job) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Render time limit reached.")), MAX_RENDER_MS);
  timer.unref();
  let refreshing = false;
  const heartbeat = setInterval(async () => {
    if (refreshing || controller.signal.aborted) return;
    refreshing = true;
    try {
      const changed = await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken} AND "state"='PROCESSING' AND "busyUntil">NOW()`;
      if (changed !== 1) controller.abort(new Error("Render ownership expired."));
    } catch { controller.abort(new Error("Render ownership could not be renewed.")); }
    finally { refreshing = false; }
  }, 30000);
  heartbeat.unref();
  try { await renderSignals.run(controller.signal, async () => {
    await db.$transaction(tx => ownLease(tx, job));
    await renderJob(job);
  }); }
  finally { clearTimeout(timer); clearInterval(heartbeat); }
}

async function renderJob(job: Job) {
  const metadata = job.metadataJson as unknown as Metadata;
  if (!metadata?.fixture?.firstTeam?.name || !metadata?.fixture?.secondTeam?.name) throw new Error("Render metadata is incomplete.");
  const inputs = await loadInputs(job.id);
  if (inputs.reduce((sum, input) => sum + input.sizeBytes, 0n) > 12n * 1024n ** 3n) throw new Error("Selected source footage exceeds the 12 GiB processing limit.");
  if (!inputs.some(input => input.role === "CONTENT")) throw new Error("No content source is attached to this render job.");
  const dir = await mkdtemp(path.join(os.tmpdir(), `sixfl-tv-${job.id}-`));
  try {
    await mkdir(path.join(dir, "source")); await mkdir(path.join(dir, "normalised"));
    const titlePng = path.join(dir, "title.png"), resultPng = path.join(dir, "result.png"), goalOfMonthPng = path.join(dir, "goal-of-month.png");
    const lineupPng = path.join(dir, "lineup.png"), footageOverlayPng = path.join(dir, job.kind === "HIGHLIGHTS" ? "score-bug.png" : "watermark.png");
    await writeFile(titlePng, await createSixflTvVideoCard({ fixture: metadata.fixture, mode: "TITLE", label: metadata.label, siteUrl: siteUrl() }));
    await writeFile(resultPng, await createSixflTvVideoCard({ fixture: metadata.fixture, mode: "FULL_TIME", label: metadata.label, siteUrl: siteUrl() }));
    await writeFile(goalOfMonthPng, await createSixflTvGoalOfMonthCard({ siteUrl: siteUrl() }));
    const lineupBytes = await createSixflTvLineupCard({ fixture: metadata.fixture });
    if (lineupBytes) await writeFile(lineupPng, lineupBytes);
    await writeFile(footageOverlayPng, job.kind === "HIGHLIGHTS" ? await createSixflTvScoreBug({ fixture: metadata.fixture }) : await createSixflTvWatermark());
    const segments: string[] = [];
    const intro = inputs.filter(input => input.role === "INTRO"), content = inputs.filter(input => input.role === "CONTENT"), outro = inputs.filter(input => input.role === "OUTRO");
    let segmentIndex = 0;
    for (const input of intro) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await reconstructAsset(input, source); await normaliseVideo(source, normal); segments.push(normal);
    }
    const title = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(titlePng, title, TITLE_SECONDS); segments.push(title);
    if (lineupBytes) {
      const lineup = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(lineupPng, lineup, LINEUP_SECONDS); segments.push(lineup);
    }
    const swipe = content.length > 1 ? path.join(dir, "normalised", "swipe.mp4") : null;
    if (swipe) await swipeVideo(dir, swipe);
    for (let index = 0; index < content.length; index++) {
      if (index > 0 && swipe) segments.push(swipe);
      const input = content[index];
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await reconstructAsset(input, source); await normaliseVideo(source, normal, footageOverlayPng); segments.push(normal);
    }
    const result = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(resultPng, result, RESULT_SECONDS); segments.push(result);
    for (const input of outro) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await reconstructAsset(input, source); await normaliseVideo(source, normal); segments.push(normal);
    }
    const goalOfMonthEnd = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
    await cardVideo(goalOfMonthPng, goalOfMonthEnd, GOAL_OF_MONTH_END_SECONDS); segments.push(goalOfMonthEnd);
    console.log(`Render assembly ${job.id}: customIntro=${intro.length} titleCard=1 lineupCard=${lineupBytes ? 1 : 0} content=${content.length} swipeTransitions=${Math.max(0, content.length - 1)} resultCard=1 score=${metadata.fixture.firstTeam.score ?? "?"}-${metadata.fixture.secondTeam.score ?? "?"} outro=${outro.length} goalOfMonthEndCard=1 footageOverlay=${job.kind === "HIGHLIGHTS" ? "FT+logo" : "logo"} renderVersion=${metadata.renderVersion ?? 1}`);
    const concat = path.join(dir, "concat.txt");
    await writeFile(concat, segments.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
    const output = path.join(dir, "output.mp4");
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", output]);
    const durationMs = Math.round((await durationSeconds(output)) * 1000);
    const stored = await storeOutput(job, output);
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
async function youtubeAccessToken() {
  const rows = await db.$queryRaw<{ refreshTokenCiphertext: string }[]>`SELECT "refreshTokenCiphertext" FROM "SixflTvYoutubeConnection" WHERE "id"='primary'`;
  if (!rows[0]) throw new Error("SIXFL YouTube is not connected.");
  const body = new URLSearchParams({ client_id: required("YOUTUBE_CLIENT_ID"), client_secret: required("YOUTUBE_CLIENT_SECRET"), refresh_token: decryptRefreshToken(rows[0].refreshTokenCiphertext), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google access token refresh failed.");
  return data.access_token;
}

async function claimPublishJob() {
  return db.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='QUEUED',"busyUntil"=NULL,"updatedAt"=NOW(),"error"='Recovered after an interrupted worker.' WHERE "state"='PROCESSING' AND "busyUntil" < NOW()`;
    const rows = await tx.$queryRaw<PublishJob[]>`
      SELECT "id","fixtureId","kind","renderJobId","thumbnailObjectKey","title","description","privacyStatus","resumableUrl","uploadedBytes","youtubeVideoId","youtubeUrl"
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

async function startYoutubeResumable(job: PublishJob, accessToken: string, total: number) {
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/videos");
  url.searchParams.set("uploadType", "resumable"); url.searchParams.set("part", "snippet,status"); url.searchParams.set("notifySubscribers", "false");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(total), "X-Upload-Content-Type": "video/mp4" },
    body: JSON.stringify({ snippet: { title: job.title, description: job.description, categoryId: "17" }, status: { privacyStatus: "private" } }),
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
    const sliceStart = offset - partStart, body = full.subarray(sliceStart);
    const end = offset + body.length - 1;
    const upload = await fetch(job.resumableUrl!, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "video/mp4", "Content-Length": String(body.length), "Content-Range": `bytes ${offset}-${end}/${total}` }, body, signal: AbortSignal.timeout(120000) });
    if (upload.status === 308) {
      offset = acknowledgedOffset(upload);
      await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "uploadedBytes"=${offset},"busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id}`;
      continue;
    }
    if (upload.ok) {
      const data = await upload.json().catch(() => ({})) as { id?: string };
      if (!data.id) throw new Error("YouTube completed the upload without returning a video ID.");
      await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "uploadedBytes"=${total},"youtubeVideoId"=${data.id},"updatedAt"=NOW() WHERE "id"=${job.id}`;
      return data.id;
    }
    const detail = await upload.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(detail.error?.message || `YouTube video upload failed (${upload.status}).`);
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

async function processPublish(job: PublishJob) {
  const accessToken = await youtubeAccessToken();
  const videoId = await uploadRenderToYoutube(job, accessToken);
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "youtubeVideoId"=${videoId},"youtubeUrl"=${youtubeUrl},"busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id}`;
  await setYoutubeThumbnail(job, videoId, accessToken);
  await saveYoutubeFixtureLink(job, youtubeUrl);
  await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='READY',"youtubeVideoId"=${videoId},"youtubeUrl"=${youtubeUrl},"uploadedBytes"=(SELECT "outputSizeBytes" FROM "SixflTvRenderJob" WHERE "id"=${job.renderJobId}),"completedAt"=NOW(),"busyUntil"=NULL,"updatedAt"=NOW(),"error"=NULL WHERE "id"=${job.id}`;
}

async function main() {
  console.log("SIXFL TV worker ready");
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
    const publish = await claimPublishJob().catch(error => { console.error("YouTube claim failed", safeError(error)); return null; });
    if (publish) {
      try { await processPublish(publish); console.log(`Published ${publish.kind} ${publish.id} privately to YouTube`); }
      catch (error) {
        const message = safeError(error); console.error(`YouTube publish ${publish.id} failed`, message);
        await db.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='FAILED',"error"=${message},"busyUntil"=NULL,"updatedAt"=NOW() WHERE "id"=${publish.id}`.catch(() => undefined);
      }
      continue;
    }
    await sleep(POLL_MS);
  }
}

// Importing the worker for isolated executable tests must never start its polling loop.
export { run, reconstructAsset, verifiedPart, storeOutput, finishOutput, processJob, failJob, renderSignals, swipeVideo, normaliseVideo };
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
