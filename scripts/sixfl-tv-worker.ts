import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Prisma, PrismaClient } from "@prisma/client";
import { createSixflTvVideoCard, type SixflTvGraphicFixture } from "../src/lib/sixfl-tv/graphics";
import { fetchRailwayObject, uploadRailwayObject } from "../src/lib/storage/railway-s3";

const db = new PrismaClient();
const PART_BYTES = 8 * 1024 * 1024;
const POLL_MS = 5000;

type Job = { id: string; fixtureId: string; kind: "HIGHLIGHTS" | "FULL_MATCH"; metadataJson: Prisma.JsonValue; leaseToken: string | null };
type Input = { assetId: string; role: "INTRO" | "CONTENT" | "OUTRO"; position: number; filename: string; partCount: number; sizeBytes: bigint; state: string };
type SourcePart = { partNumber: number; objectKey: string; sizeBytes: number; stored: boolean };

type Metadata = { fixture: SixflTvGraphicFixture; label: string; contentAssetIds: string[] };

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown render error");
  return message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 900) || "Render failed.";
}
function siteUrl() { return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://sixfl.co.uk").replace(/\/+$/, ""); }

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
  const fadeOut = Math.max(0.2, seconds - 0.2).toFixed(3);
  const videoFilter = `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=30,format=yuv420p,fade=t=in:st=0:d=0.18,fade=t=out:st=${fadeOut}:d=0.18`;
  if (audio) {
    const audioFilter = `aresample=48000,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOut}:d=0.12`;
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
    for (const group of [intro]) for (const input of group) {
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

async function main() {
  console.log("SIXFL TV worker ready");
  for (;;) {
    const job = await claimJob().catch(error => { console.error("Render claim failed", safeError(error)); return null; });
    if (!job) { await sleep(POLL_MS); continue; }
    try { await processJob(job); console.log(`Rendered ${job.kind} ${job.id}`); }
    catch (error) {
      const message = safeError(error); console.error(`Render ${job.id} failed`, message);
      await db.$executeRaw`UPDATE "SixflTvRenderJob" SET "state"='FAILED',"error"=${message},"leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW() WHERE "id"=${job.id}`.catch(() => undefined);
    }
  }
}

process.on("SIGTERM", () => void db.$disconnect().finally(() => process.exit(0)));
process.on("SIGINT", () => void db.$disconnect().finally(() => process.exit(0)));
void main().catch(async error => { console.error("SIXFL TV worker stopped", safeError(error)); await db.$disconnect(); process.exit(1); });
