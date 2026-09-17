import { createDecipheriv, createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";
import { createSixflTvVideoCard, type SixflTvGraphicFixture } from "../src/lib/sixfl-tv/graphics";
import { fetchRailwayObject, uploadRailwayObject } from "../src/lib/storage/railway-s3";
import { buildSixflTvVideoValue, parseSixflTvVideoValue } from "../src/lib/sixfl-tv/videos";

const db = new PrismaClient();
const PART_BYTES = 8 * 1024 * 1024;
const POLL_MS = 5000;

type Job = { id: string; fixtureId: string; kind: "HIGHLIGHTS" | "FULL_MATCH"; metadataJson: Prisma.JsonValue; leaseToken: string | null };
type Input = { assetId: string; role: "INTRO" | "CONTENT" | "OUTRO"; position: number; filename: string; partCount: number; sizeBytes: bigint; state: string };
type SourcePart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean };
type RenderPart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean };
type PublishJob = {
  id: string; fixtureId: string; kind: "HIGHLIGHTS" | "FULL_MATCH"; renderJobId: string; thumbnailObjectKey: string;
  title: string; description: string; privacyStatus: "private"; resumableUrl: string | null; uploadedBytes: bigint;
  youtubeVideoId: string | null; youtubeUrl: string | null;
};
type Metadata = { fixture: SixflTvGraphicFixture; label: string; contentAssetIds: string[] };

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

async function run(bin: string, args: string[], capture = false) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", capture ? "pipe" : "ignore", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout?.on("data", chunk => { stdout = (stdout + String(chunk)).slice(-65536); });
    child.stderr?.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-65536); });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-4000)}`)));
  });
}
async function durationSeconds(file: string) {
  const value = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], true);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("FFprobe could not determine video duration.");
  return seconds;
}
async function hasAudio(file: string) {
  const value = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", file], true).catch(() => "");
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

async function reconstructAsset(input: Input, target: string) {
  if (input.state !== "READY") throw new Error(`Source ${input.filename} is no longer ready.`);
  const parts = await db.$queryRaw<SourcePart[]>`SELECT "partNumber","objectKey","sizeBytes","stored" FROM "SixflTvFootagePart" WHERE "assetId"=${input.assetId} ORDER BY "partNumber"`;
  if (parts.length !== input.partCount || parts.some((part, index) => part.partNumber !== index || !part.stored)) throw new Error(`Source ${input.filename} is incomplete.`);
  const handle = await open(target, "w");
  try {
    let written = 0;
    for (const part of parts) {
      const response = await fetchRailwayObject({ key: part.objectKey, signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`Source storage returned ${response.status}.`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length !== part.sizeBytes) throw new Error(`Source ${input.filename} part length changed.`);
      await handle.write(bytes);
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

async function normaliseVideo(source: string, target: string) {
  const seconds = await durationSeconds(source), audio = await hasAudio(source);
  const fadeOutStart = Math.max(0, seconds - 0.18).toFixed(3);
  const videoFilter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,fade=t=in:st=0:d=0.18,fade=t=out:st=${fadeOutStart}:d=0.18`;
  if (audio) {
    const audioFilter = `aresample=48000,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOutStart}:d=0.12`;
    await run("ffmpeg", ["-y", "-i", source, "-map", "0:v:0", "-map", "0:a:0", "-vf", videoFilter, "-af", audioFilter,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
  } else {
    await run("ffmpeg", ["-y", "-i", source, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", "0:v:0", "-map", "1:a:0", "-t", String(seconds), "-shortest", "-vf", videoFilter,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
  }
}

async function storeOutput(job: Job, file: string) {
  const handle = await open(file, "r");
  let position = 0, partNumber = 0;
  try {
    for (;;) {
      const buffer = Buffer.allocUnsafe(PART_BYTES);
      const result = await handle.read(buffer, 0, PART_BYTES, position);
      if (!result.bytesRead) break;
      const bytes = buffer.subarray(0, result.bytesRead), digest = createHash("sha256").update(bytes).digest("hex");
      const key = `sixfl-tv-render/v1/${job.id}/${partNumber}-${digest}`;
      await db.$executeRaw`INSERT INTO "SixflTvRenderPart" ("jobId","partNumber","objectKey","sha256","sizeBytes") VALUES (${job.id},${partNumber},${key},${digest},${bytes.length}) ON CONFLICT ("jobId","partNumber") DO NOTHING`;
      await uploadRailwayObject({ key, body: bytes, contentType: "application/octet-stream", signal: AbortSignal.timeout(60000) });
      await db.$executeRaw`UPDATE "SixflTvRenderPart" SET "stored"=true WHERE "jobId"=${job.id} AND "partNumber"=${partNumber} AND "sha256"=${digest}`;
      position += result.bytesRead; partNumber++;
    }
  } finally { await handle.close(); }
  if (!partNumber) throw new Error("Renderer produced an empty file.");
  return { sizeBytes: position, partCount: partNumber };
}

async function processJob(job: Job) {
  const metadata = job.metadataJson as unknown as Metadata;
  if (!metadata?.fixture?.firstTeam?.name || !metadata?.fixture?.secondTeam?.name) throw new Error("Render metadata is incomplete.");
  const inputs = await loadInputs(job.id);
  if (!inputs.some(input => input.role === "CONTENT")) throw new Error("No content source is attached to this render job.");
  const dir = await mkdtemp(path.join(os.tmpdir(), `sixfl-tv-${job.id}-`));
  const heartbeat = setInterval(() => void db.$executeRaw`UPDATE "SixflTvRenderJob" SET "busyUntil"=NOW()+INTERVAL '12 minutes',"updatedAt"=NOW() WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken}`.catch(() => undefined), 60000);
  try {
    await mkdir(path.join(dir, "source")); await mkdir(path.join(dir, "normalised"));
    const titlePng = path.join(dir, "title.png"), resultPng = path.join(dir, "result.png");
    await writeFile(titlePng, await createSixflTvVideoCard({ fixture: metadata.fixture, mode: "TITLE", label: metadata.label, siteUrl: siteUrl() }));
    await writeFile(resultPng, await createSixflTvVideoCard({ fixture: metadata.fixture, mode: "FULL_TIME", label: metadata.label, siteUrl: siteUrl() }));
    const segments: string[] = [];
    const intro = inputs.filter(input => input.role === "INTRO"), content = inputs.filter(input => input.role === "CONTENT"), outro = inputs.filter(input => input.role === "OUTRO");
    let segmentIndex = 0;
    for (const input of intro) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await reconstructAsset(input, source); await normaliseVideo(source, normal); segments.push(normal);
    }
    const title = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(titlePng, title, 3); segments.push(title);
    for (const input of content) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await reconstructAsset(input, source); await normaliseVideo(source, normal); segments.push(normal);
    }
    const result = path.join(dir, "normalised", `${segmentIndex++}.mp4`); await cardVideo(resultPng, result, 4); segments.push(result);
    for (const input of outro) {
      const source = path.join(dir, "source", `${input.position}.mp4`), normal = path.join(dir, "normalised", `${segmentIndex++}.mp4`);
      await reconstructAsset(input, source); await normaliseVideo(source, normal); segments.push(normal);
    }
    const concat = path.join(dir, "concat.txt");
    await writeFile(concat, segments.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
    const output = path.join(dir, "output.mp4");
    await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", output]);
    const durationMs = Math.round((await durationSeconds(output)) * 1000);
    const stored = await storeOutput(job, output);
    await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='READY',"outputSizeBytes"=${stored.sizeBytes},"partCount"=${stored.partCount},"durationMs"=${durationMs},"completedAt"=NOW(),"busyUntil"=NULL,"leaseToken"=NULL,"updatedAt"=NOW(),"error"=NULL WHERE "id"=${job.id} AND "leaseToken"=${job.leaseToken}`;
  } finally {
    clearInterval(heartbeat);
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
  const parts = await db.$queryRaw<RenderPart[]>`SELECT "partNumber","objectKey","sizeBytes","stored" FROM "SixflTvRenderPart" WHERE "jobId"=${job.renderJobId} ORDER BY "partNumber"`;
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
  for (;;) {
    const job = await claimJob().catch(error => { console.error("Render claim failed", safeError(error)); return null; });
    if (job) {
      try { await processJob(job); console.log(`Rendered ${job.kind} ${job.id}`); }
      catch (error) {
        const message = safeError(error); console.error(`Render ${job.id} failed`, message);
        await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='FAILED',"error"=${message},"leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW() WHERE "id"=${job.id}`.catch(() => undefined);
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

process.on("SIGTERM", () => void db.$disconnect().finally(() => process.exit(0)));
process.on("SIGINT", () => void db.$disconnect().finally(() => process.exit(0)));
void main().catch(async error => { console.error("SIXFL TV worker stopped", safeError(error)); await db.$disconnect(); process.exit(1); });
