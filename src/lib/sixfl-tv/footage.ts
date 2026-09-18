import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { uploadRailwayObject, deleteRailwayObject } from "@/lib/storage/railway-s3";
import { FOOTAGE_PART_BYTES, FOOTAGE_STORAGE_LIMIT_BYTES, FootageError, footageSpec, expectedFootagePartBytes, looksLikeMp4, type FootageKind } from "./footage-policy";

// These readers need only raw queries, not model delegates. The production
// client extends notification models; both it and its transactions support this.
type FootageReader = Pick<Prisma.TransactionClient, "$queryRaw">;
export type FootageAsset = {
  id: string; fixtureId: string | null; kind: FootageKind; filename: string;
  sizeBytes: bigint; lastModified: bigint; partCount: number; position: number;
  clipNumber: number | null; posterObjectKey: string | null; posterSizeBytes: number | null;
  state: "UPLOADING" | "READY" | "DELETING" | "DELETED";
  leaseToken: string | null; busyUntil: Date | null; createdAt: Date;
};
export type FootagePart = { assetId: string; partNumber: number; objectKey: string; sha256: string; sizeBytes: number; stored: boolean };
export function footageStorageConfigured() {
  return ["AWS_ENDPOINT_URL", "AWS_S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"].every(name => Boolean(process.env[name]?.trim()));
}
export function checkFootageOrigin(request: Request) {
  const allowed = new Set(["https://sixfl.co.uk", "https://www.sixfl.co.uk"]);
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (value) { try { allowed.add(new URL(value).origin); } catch { /* Invalid configuration is not an allowed origin. */ } }
  }
  if (process.env.NODE_ENV !== "production") allowed.add(new URL(request.url).origin);
  if (!allowed.has(request.headers.get("origin") || "")) throw new FootageError("Reload SIXFL and try again.", 403);
}
export async function readFootageBytes(request: Request, maximum = FOOTAGE_PART_BYTES): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") || 0) > maximum) throw new FootageError("Upload part is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new FootageError("No upload content received.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new FootageError("Upload part is too large.", 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export async function readFootageJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = JSON.parse(Buffer.from(await readFootageBytes(request, 32768)).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new FootageError("Invalid upload request.");
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof FootageError) throw error;
    throw new FootageError("Invalid upload request.");
  }
}
export async function footageFixture(fixtureId: string) {
  const fixture = await prisma.fixture.findUnique({ where: { id: fixtureId }, select: {
    id: true, kickoffAt: true, status: true,
    league: { select: { name: true } },
    homeTeam: { select: { id: true, name: true, logoUrl: true } },
    awayTeam: { select: { id: true, name: true, logoUrl: true } },
    result: { select: { homeScore: true, awayScore: true, isDisputed: true } },
  } });
  if (!fixture) throw new FootageError("Fixture not found.", 404);
  // Uploading is allowed before a result is recorded; no result is invented.
  return fixture;
}
function dto(asset: FootageAsset) {
  return { id: asset.id, kind: asset.kind, filename: asset.filename, sizeBytes: Number(asset.sizeBytes),
    lastModified: Number(asset.lastModified), partCount: asset.partCount, position: asset.position,
    clipNumber: asset.clipNumber, posterReady: Boolean(asset.posterObjectKey && asset.posterSizeBytes),
    state: asset.state, shared: asset.fixtureId === null };
}
export async function footageAsset(fixtureId: string | null, assetId: string, tx: FootageReader = prisma, lock = false) {
  const scope = fixtureId === null
    ? Prisma.sql`"fixtureId" IS NULL AND "kind" IN ('INTRO','OUTRO')`
    : Prisma.sql`("fixtureId"=${fixtureId} OR ("fixtureId" IS NULL AND "kind" IN ('INTRO','OUTRO')))`;
  const rows = await tx.$queryRaw<FootageAsset[]>(Prisma.sql`
    SELECT * FROM "SixflTvFootageAsset" WHERE "id"=${assetId}
      AND ${scope}
      ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  if (!rows[0] || rows[0].state === "DELETED") throw new FootageError("Footage not found.", 404);
  return rows[0];
}
export async function footageParts(assetId: string, tx: FootageReader = prisma) {
  return tx.$queryRaw<FootagePart[]>`SELECT * FROM "SixflTvFootagePart" WHERE "assetId"=${assetId} ORDER BY "partNumber"`;
}
export async function footageState(fixtureId: string | null) {
  const scope = fixtureId === null
    ? Prisma.sql`"fixtureId" IS NULL AND "kind" IN ('INTRO','OUTRO')`
    : Prisma.sql`("fixtureId"=${fixtureId} OR "fixtureId" IS NULL)`;
  const assets = await prisma.$queryRaw<FootageAsset[]>(Prisma.sql`
    SELECT * FROM "SixflTvFootageAsset" WHERE "state" <> 'DELETED'
      AND ${scope} ORDER BY "position", "createdAt", "id"`);
  const usage = await prisma.$queryRaw<{ reserved: bigint; uploaded: bigint }[]>`
    SELECT (SELECT COALESCE(SUM("sizeBytes"),0) FROM "SixflTvFootageAsset" WHERE "state" <> 'DELETED') AS reserved,
      (SELECT COALESCE(SUM(p."sizeBytes"),0) FROM "SixflTvFootagePart" p JOIN "SixflTvFootageAsset" a ON a."id"=p."assetId" WHERE a."state" <> 'DELETED' AND p."stored") AS uploaded`;
  return { assets: assets.map(dto), configured: footageStorageConfigured(), partBytes: FOOTAGE_PART_BYTES,
    reservedBytes: Number(usage[0]?.reserved || 0), uploadedBytes: Number(usage[0]?.uploaded || 0), limitBytes: FOOTAGE_STORAGE_LIMIT_BYTES };
}
export async function resumeFootage(fixtureId: string | null, assetId: string) {
  const asset = await footageAsset(fixtureId, assetId);
  if (!["UPLOADING", "READY"].includes(asset.state)) throw new FootageError("This file is being removed.", 409);
  const parts = await footageParts(assetId);
  return { asset: dto(asset), parts: parts.filter(p => p.stored).map(p => ({ partNumber: p.partNumber, sha256: p.sha256, sizeBytes: p.sizeBytes })) };
}
export async function beginFootage(fixtureId: string | null, actor: string, data: Record<string, unknown>) {
  if (!footageStorageConfigured()) throw new FootageError("Private video storage is not configured yet.", 503);
  if (fixtureId) await footageFixture(fixtureId);
  const spec = footageSpec(data), global = spec.kind === "INTRO" || spec.kind === "OUTRO";
  if (fixtureId === null && !global) throw new FootageError("The shared SIXFL TV library accepts only the intro and outro.", 400);
  const scope = global ? null : fixtureId;
  return prisma.$transaction(async tx => {
    // Serialise reservations so parallel tabs cannot exceed the pilot limit.
    // PostgreSQL's void return must be cast before Prisma deserialises it.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424420)::text`;
    const existing = await tx.$queryRaw<FootageAsset[]>`
      SELECT * FROM "SixflTvFootageAsset" WHERE "fixtureId" IS NOT DISTINCT FROM ${scope}::text
        AND "kind"=${spec.kind} AND "filename"=${spec.filename} AND "sizeBytes"=${spec.sizeBytes}
        AND "lastModified"=${spec.lastModified} AND "state" IN ('UPLOADING','READY') LIMIT 1`;
    if (existing[0]) return { asset: dto(existing[0]), reused: true };
    const assets = await tx.$queryRaw<FootageAsset[]>`SELECT * FROM "SixflTvFootageAsset" WHERE "fixtureId" IS NOT DISTINCT FROM ${scope}::text AND "kind"=${spec.kind} AND "state" <> 'DELETED'`;
    const maxFiles = spec.kind === "CLIP" ? 50 : global ? 5 : 1;
    if (assets.length >= maxFiles) throw new FootageError(`This video slot already has ${maxFiles} file${maxFiles === 1 ? "" : "s"}. Remove an old upload before adding another.`, 409);
    const usage = await tx.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM("sizeBytes"),0)::bigint AS bytes FROM "SixflTvFootageAsset" WHERE "state" <> 'DELETED'`;
    if (Number(usage[0].bytes) + spec.sizeBytes > FOOTAGE_STORAGE_LIMIT_BYTES) throw new FootageError("The 100 GiB footage-library limit would be exceeded. Remove files you no longer need first.", 409);
    const position = assets.reduce((max, a) => Math.max(max, a.position + 1), 0);
    const clipNumber = spec.kind === "CLIP"
      ? Number((await tx.$queryRaw<Array<{ nextClipNumber: number }>>`
          SELECT (COALESCE(MAX("clipNumber"), 0) + 1)::int AS "nextClipNumber"
          FROM "SixflTvFootageAsset"
          WHERE "fixtureId" = ${scope} AND "kind" = 'CLIP'
        `)[0]?.nextClipNumber ?? 1)
      : null;
    const rows = await tx.$queryRaw<FootageAsset[]>`
      INSERT INTO "SixflTvFootageAsset" ("id","fixtureId","kind","filename","sizeBytes","lastModified","partCount","position","clipNumber","createdByActor")
      VALUES (${randomUUID()},${scope},${spec.kind},${spec.filename},${spec.sizeBytes},${spec.lastModified},${spec.partCount},${position},${clipNumber},${actor}) RETURNING *`;
    return { asset: dto(rows[0]), reused: false };
  });
}
export async function putFootagePart(fixtureId: string | null, assetId: string, partNumber: number, bytes: Uint8Array) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const lease = randomUUID();
  const reservation = await prisma.$transaction(async tx => {
    const asset = await footageAsset(fixtureId, assetId, tx, true);
    if (asset.state !== "UPLOADING") throw new FootageError("This file is no longer writable.", 409);
    if (bytes.byteLength !== expectedFootagePartBytes(Number(asset.sizeBytes), partNumber)) throw new FootageError("Upload part size does not match the selected file.");
    if (partNumber === 0 && !looksLikeMp4(bytes)) throw new FootageError("This is not a supported MP4 file. Renaming a file does not convert it.");
    const old = await tx.$queryRaw<FootagePart[]>`SELECT * FROM "SixflTvFootagePart" WHERE "assetId"=${assetId} AND "partNumber"=${partNumber}`;
    if (old[0] && old[0].sha256 !== sha256) throw new FootageError("The selected file differs from the previous upload. Remove the incomplete upload and choose the correct file.", 409);
    if (old[0]?.stored) return { alreadyStored: true, key: old[0].objectKey };
    if (asset.busyUntil && asset.busyUntil > new Date()) throw new FootageError("A part is still being saved. Wait a moment, then resume.", 409);
    const key = `sixfl-tv-footage/v1/${assetId}/${partNumber}-${sha256}`;
    // Reserve the exact immutable key BEFORE storage I/O, so crash cleanup knows it.
    await tx.$executeRaw`INSERT INTO "SixflTvFootagePart" ("assetId","partNumber","objectKey","sha256","sizeBytes") VALUES (${assetId},${partNumber},${key},${sha256},${bytes.byteLength}) ON CONFLICT ("assetId","partNumber") DO NOTHING`;
    await tx.$executeRaw`UPDATE "SixflTvFootageAsset" SET "leaseToken"=${lease},"busyUntil"=NOW()+INTERVAL '2 minutes',"updatedAt"=NOW() WHERE "id"=${assetId}`;
    return { alreadyStored: false, key };
  });
  if (reservation.alreadyStored) return { sha256, stored: true };
  // Only one bounded part is in memory. No full-match request or render runs here.
  await uploadRailwayObject({ key: reservation.key, body: bytes, contentType: "application/octet-stream", signal: AbortSignal.timeout(30000) });
  await prisma.$transaction(async tx => {
    const asset = await footageAsset(fixtureId, assetId, tx, true);
    if (asset.state !== "UPLOADING" || asset.leaseToken !== lease) throw new FootageError("This upload changed. Reload the page.", 409);
    await tx.$executeRaw`UPDATE "SixflTvFootagePart" SET "stored"=true WHERE "assetId"=${assetId} AND "partNumber"=${partNumber} AND "sha256"=${sha256}`;
    await tx.$executeRaw`UPDATE "SixflTvFootageAsset" SET "leaseToken"=NULL,"busyUntil"=NULL,"updatedAt"=NOW() WHERE "id"=${assetId}`;
  });
  return { sha256, stored: true };
}
export async function finishFootage(fixtureId: string | null, assetId: string) {
  return prisma.$transaction(async tx => {
    const asset = await footageAsset(fixtureId, assetId, tx, true);
    if (asset.state === "READY") return;
    if (asset.state !== "UPLOADING" || (asset.busyUntil && asset.busyUntil > new Date())) throw new FootageError("Wait for the active upload to finish.", 409);
    const parts = await footageParts(assetId, tx);
    if (parts.length !== asset.partCount || parts.some((p, i) => !p.stored || p.partNumber !== i || p.sizeBytes !== expectedFootagePartBytes(Number(asset.sizeBytes), i))) throw new FootageError("Some footage has not finished uploading. Reselect the same file to resume.", 409);
    await tx.$executeRaw`UPDATE "SixflTvFootageAsset" SET "state"='READY',"completedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${assetId}`;
  });
}
export async function reorderFootage(fixtureId: string, requested: unknown, expected: unknown) {
  if (!Array.isArray(requested) || !Array.isArray(expected) || requested.length > 50 || requested.some(x => typeof x !== "string")) throw new FootageError("Invalid clip order.");
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424420)::text`;
    const clips = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SixflTvFootageAsset" WHERE "fixtureId"=${fixtureId} AND "kind"='CLIP' AND "state" IN ('UPLOADING','READY') ORDER BY "position","createdAt","id" FOR UPDATE`;
    const current = clips.map(c => c.id);
    if (JSON.stringify(current) !== JSON.stringify(expected) || requested.length !== current.length || new Set(requested).size !== current.length || requested.some(id => !current.includes(id))) throw new FootageError("The clip list changed in another session. Reload before reordering.", 409);
    for (let i = 0; i < requested.length; i++) await tx.$executeRaw`UPDATE "SixflTvFootageAsset" SET "position"=${i},"updatedAt"=NOW() WHERE "id"=${requested[i]} AND "fixtureId"=${fixtureId}`;
  });
}
export async function removeFootage(fixtureId: string | null, assetId: string, confirmed: unknown) {
  if (confirmed !== true) throw new FootageError("Confirm before deleting source footage.");
  await prisma.$transaction(async tx => {
    const asset = await footageAsset(fixtureId, assetId, tx, true);
    if (asset.busyUntil && asset.busyUntil > new Date()) throw new FootageError("An upload is still saving. Pause it and wait up to two minutes before removing it.", 409);
    const active = await tx.$queryRaw<{ id: string }[]>`
      SELECT j."id" FROM "SixflTvRenderInput" i
      JOIN "SixflTvRenderJob" j ON j."id"=i."jobId"
      WHERE i."assetId"=${assetId} AND j."state" IN ('QUEUED','PROCESSING')
      LIMIT 1`;
    if (active[0]) throw new FootageError("This source is being used by an active SIXFL TV render. Wait for the preview to finish before removing it.", 409);
    const nominated = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GoalOfMonthCandidate"
      WHERE "clipAssetId"=${assetId} AND "status"='ACTIVE'
      LIMIT 1`;
    if (nominated[0]) throw new FootageError("This clip is being used by Goal of the Month. Remove the nomination first before deleting the source clip.", 409);
    await tx.$executeRaw`UPDATE "SixflTvFootageAsset" SET "state"='DELETING',"updatedAt"=NOW() WHERE "id"=${assetId}`;
  });
  // Bounded batches allow large removals to be retried without a long web request.
  // Only this asset's reserved keys can be deleted; no caller-supplied paths.
  const parts = await footageParts(assetId);
  for (const part of parts.slice(0, 20)) {
    await deleteRailwayObject(part.objectKey, AbortSignal.timeout(15000));
    await prisma.$executeRaw`DELETE FROM "SixflTvFootagePart" WHERE "assetId"=${assetId} AND "partNumber"=${part.partNumber}`;
  }
  const remaining = await footageParts(assetId);
  if (!remaining.length) await prisma.$executeRaw`UPDATE "SixflTvFootageAsset" SET "state"='DELETED',"updatedAt"=NOW() WHERE "id"=${assetId} AND "state"='DELETING'`;
  return { removed: remaining.length === 0, remainingParts: remaining.length };
}