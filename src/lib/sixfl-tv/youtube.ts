import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchRailwayObject } from "@/lib/storage/railway-s3";
import { StudioError, studioFixture, type SixflTvRenderKind } from "./studio";
import { sixflTvYoutubeDefaults } from "./youtube-metadata";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const YOUTUBE_READ_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const YOUTUBE_MANAGE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

type Connection = { refreshTokenCiphertext: string; channelId: string | null; channelTitle: string | null; scope: string };
type ConnectionSummary = { channelId: string | null; channelTitle: string | null; connectedAt: Date; scope: string };
type PublishRow = { id: string; kind: SixflTvRenderKind; state: string; title: string; privacyStatus: string; youtubeVideoId: string | null; youtubeUrl: string | null; error: string | null; createdAt: Date; completedAt: Date | null };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new StudioError(`${name} is not configured.`, 503);
  return value;
}
function config() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://sixfl.co.uk").replace(/\/+$/, "");
  // Pin this independently in production: Google requires the exact registered URI
  // in both the authorisation request and the subsequent code/token exchange.
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim() || `${site}/api/admin/sixfl-tv/youtube/callback`;
  return { clientId: required("YOUTUBE_CLIENT_ID"), clientSecret: required("YOUTUBE_CLIENT_SECRET"), tokenKey: required("SIXFL_TV_TOKEN_KEY"),
    redirectUri, stateKey: process.env.NEXTAUTH_SECRET?.trim() || required("SIXFL_TV_TOKEN_KEY") };
}
function key(value: string) { return createHash("sha256").update(value).digest(); }
function encode(value: Buffer | string) { return Buffer.from(value).toString("base64url"); }
function decode(value: string) { return Buffer.from(value, "base64url"); }
function encrypt(value: string) {
  const { tokenKey } = config(), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(tokenKey), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]), tag = cipher.getAuthTag();
  return `v1.${encode(iv)}.${encode(tag)}.${encode(ciphertext)}`;
}
export function decryptYoutubeRefreshToken(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported YouTube token format.");
  const { tokenKey } = config(), decipher = createDecipheriv("aes-256-gcm", key(tokenKey), decode(parts[1]));
  decipher.setAuthTag(decode(parts[2]));
  return Buffer.concat([decipher.update(decode(parts[3])), decipher.final()]).toString("utf8");
}
function signState(payload: string) { return encode(createHmac("sha256", config().stateKey).update(payload).digest()); }
export function createYoutubeState(fixtureId: string | null = null) {
  const payload = encode(JSON.stringify({ fixtureId, exp: Date.now() + 10 * 60 * 1000, nonce: randomUUID() }));
  return `${payload}.${signState(payload)}`;
}
export function verifyYoutubeState(value: string) {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new StudioError("YouTube authorisation expired. Start again.", 400);
  const expected = decode(signState(payload)), actual = decode(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new StudioError("YouTube authorisation could not be verified.", 400);
  const parsed = JSON.parse(decode(payload).toString("utf8")) as { fixtureId?: unknown; exp?: unknown };
  const validFixture = parsed.fixtureId === null || (typeof parsed.fixtureId === "string" && Boolean(parsed.fixtureId));
  if (!validFixture || typeof parsed.exp !== "number" || parsed.exp < Date.now()) throw new StudioError("YouTube authorisation expired. Start again.", 400);
  return parsed.fixtureId as string | null;
}
export function youtubeAuthorisationUrl(fixtureId: string | null = null) {
  const cfg = config(), url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", cfg.clientId); url.searchParams.set("redirect_uri", cfg.redirectUri); url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READ_SCOPE} ${YOUTUBE_MANAGE_SCOPE}`); url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true"); url.searchParams.set("state", createYoutubeState(fixtureId));
  return url.toString();
}
async function tokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; scope?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new StudioError(data.error_description || data.error || "Google did not complete YouTube authorisation.", 502);
  return data;
}
async function channelFor(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=1", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await response.json().catch(() => ({})) as { items?: Array<{ id?: string; snippet?: { title?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new StudioError(data.error?.message || "YouTube channel details could not be read.", 502);
  return { id: data.items?.[0]?.id || null, title: data.items?.[0]?.snippet?.title || null };
}
export async function completeYoutubeAuthorisation(code: string, state: string, actor: string) {
  const fixtureId = verifyYoutubeState(state);
  if (fixtureId) await studioFixture(fixtureId);
  const cfg = config();
  const token = await tokenRequest(new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }));
  if (!token.refresh_token) throw new StudioError("Google did not return a refresh token. Remove the app from your Google account permissions and connect it again.", 409);
  const channel = await channelFor(token.access_token!);
  if (!channel.id) throw new StudioError("Google authorised the account, but no YouTube channel was found for it.", 409);
  await prisma.$executeRaw`
    INSERT INTO "SixflTvYoutubeConnection" ("id","refreshTokenCiphertext","channelId","channelTitle","scope","connectedByActor")
    VALUES ('primary',${encrypt(token.refresh_token)},${channel.id},${channel.title},${token.scope || `${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READ_SCOPE} ${YOUTUBE_MANAGE_SCOPE}`},${actor})
    ON CONFLICT ("id") DO UPDATE SET "refreshTokenCiphertext"=EXCLUDED."refreshTokenCiphertext","channelId"=EXCLUDED."channelId","channelTitle"=EXCLUDED."channelTitle","scope"=EXCLUDED."scope","connectedByActor"=EXCLUDED."connectedByActor","connectedAt"=NOW(),"updatedAt"=NOW()`;
  return fixtureId;
}
export async function getYoutubeConnectionStatus() {
  const configured = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "SIXFL_TV_TOKEN_KEY"].every(name => Boolean(process.env[name]?.trim()));
  const rows = await prisma.$queryRaw<ConnectionSummary[]>`SELECT "channelId","channelTitle","connectedAt","scope" FROM "SixflTvYoutubeConnection" WHERE "id"='primary'`;
  const scopes = new Set((rows[0]?.scope || "").split(/\s+/).filter(Boolean));
  return {
    configured,
    connected: Boolean(rows[0]),
    channelId: rows[0]?.channelId || null,
    channelTitle: rows[0]?.channelTitle || null,
    connectedAt: rows[0]?.connectedAt?.toISOString() || null,
    replacementCleanupEnabled: scopes.has(YOUTUBE_MANAGE_SCOPE) || scopes.has("https://www.googleapis.com/auth/youtube"),
  };
}

export async function checkYoutubeConnection() {
  const accessToken = await youtubeAccessToken();
  const channel = await channelFor(accessToken);
  if (!channel.id) throw new StudioError("The authorised Google account no longer exposes a YouTube channel.", 409);
  return { channelId: channel.id, channelTitle: channel.title };
}

export async function youtubeAccessToken() {
  const rows = await prisma.$queryRaw<Connection[]>`SELECT "refreshTokenCiphertext","channelId","channelTitle","scope" FROM "SixflTvYoutubeConnection" WHERE "id"='primary'`;
  if (!rows[0]) throw new StudioError("Connect the SIXFL YouTube channel first.", 409);
  const cfg = config();
  const token = await tokenRequest(new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: decryptYoutubeRefreshToken(rows[0].refreshTokenCiphertext), grant_type: "refresh_token" }));
  return token.access_token!;
}
function cleanTitle(value: unknown, max: number) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function cleanDescription(value: unknown, max: number) {
  return String(value ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").split("\n").map(line => line.replace(/[ \t]+/g, " ").trimEnd()).join("\n").trim().slice(0, max);
}
export async function queueYoutubePublish(fixtureId: string, kind: SixflTvRenderKind, actor: string, data: Record<string, unknown>) {
  if (kind !== "HIGHLIGHTS" && kind !== "FULL_MATCH") throw new StudioError("Unknown video type.");
  const fixture = await studioFixture(fixtureId);
  const connection = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SixflTvYoutubeConnection" WHERE "id"='primary'`;
  if (!connection[0]) throw new StudioError("Connect the SIXFL YouTube channel first.", 409);
  const render = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SixflTvRenderJob" WHERE "fixtureId"=${fixtureId} AND "kind"=${kind} AND "state"='READY' ORDER BY "createdAt" DESC LIMIT 1`;
  if (!render[0]) throw new StudioError(`Generate and review the ${kind === "HIGHLIGHTS" ? "highlights" : "full-match"} preview first.`, 409);
  const thumb = await prisma.$queryRaw<{ objectKey: string }[]>`SELECT "objectKey" FROM "SixflTvThumbnail" WHERE "fixtureId"=${fixtureId} AND "kind"=${kind}`;
  if (!thumb[0]) throw new StudioError(`Save the ${kind === "HIGHLIGHTS" ? "highlights" : "full-match"} thumbnail first.`, 409);

  const defaults = sixflTvYoutubeDefaults(fixture, kind);
  const title = cleanTitle(data.title || defaults.title, 100);
  const description = cleanDescription(data.description || defaults.description, 5000);
  if (!title) throw new StudioError("Add a YouTube title.");

  return prisma.$transaction(async tx => {
    // Share the same fixture/kind publish lock as the automatic publisher.
    // This makes manual Publish / retry idempotent even if the automatic worker
    // finishes between the browser's last poll and the admin clicking the button.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(76424424)::text`;

    const exact = await tx.$queryRaw<Array<{
      id: string;
      state: "QUEUED" | "PROCESSING" | "READY" | "FAILED";
      privacyStatus: "private" | "unlisted" | "public";
    }>>`
      SELECT "id","state","privacyStatus"
      FROM "SixflTvYoutubePublish"
      WHERE "renderJobId"=${render[0].id}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
      FOR UPDATE
    `;
    const existing = exact[0];
    if (existing?.state === "READY") {
      return {
        id: existing.id,
        kind,
        state: "READY" as const,
        privacyStatus: existing.privacyStatus,
        resumed: false,
        alreadyPublished: true,
      };
    }
    if (existing?.state === "QUEUED" || existing?.state === "PROCESSING") {
      return {
        id: existing.id,
        kind,
        state: existing.state,
        privacyStatus: existing.privacyStatus,
        resumed: false,
        alreadyQueued: true,
      };
    }
    if (existing?.state === "FAILED") {
      await tx.$executeRaw`
        UPDATE "SixflTvYoutubePublish"
        SET "state"='QUEUED',
            "thumbnailObjectKey"=${thumb[0].objectKey},
            "title"=${title},
            "description"=${description},
            "privacyStatus"='public',
            "requestedByActor"=${actor},
            "error"=NULL,
            "busyUntil"=NULL,
            "resumableUrl"=NULL,
            "uploadedBytes"=0,
            "youtubeVideoId"=NULL,
            "youtubeUrl"=NULL,
            "completedAt"=NULL,
            "updatedAt"=NOW()
        WHERE "id"=${existing.id}
      `;
      return { id: existing.id, kind, state: "QUEUED" as const, privacyStatus: "public" as const, resumed: true };
    }

    const active = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "SixflTvYoutubePublish"
      WHERE "fixtureId"=${fixtureId}
        AND "kind"=${kind}
        AND "state" IN ('QUEUED','PROCESSING')
      LIMIT 1
      FOR UPDATE
    `;
    if (active[0]) throw new StudioError("This video is already being uploaded to YouTube.", 409);

    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "SixflTvYoutubePublish"
        ("id","fixtureId","kind","renderJobId","thumbnailObjectKey","title","description","privacyStatus","requestedByActor")
      VALUES
        (${id},${fixtureId},${kind},${render[0].id},${thumb[0].objectKey},${title},${description},'public',${actor})
    `;
    return { id, kind, state: "QUEUED" as const, privacyStatus: "public" as const, resumed: false };
  });
}
export async function syncPublishedYoutubeThumbnail(fixtureId: string, kind: SixflTvRenderKind) {
  const rows = await prisma.$queryRaw<Array<{ youtubeVideoId: string | null; objectKey: string | null }>>(Prisma.sql`
    SELECT p."youtubeVideoId", t."objectKey"
    FROM "SixflTvYoutubePublish" p
    LEFT JOIN "SixflTvThumbnail" t ON t."fixtureId"=p."fixtureId" AND t."kind"=p."kind"
    WHERE p."fixtureId"=${fixtureId}
      AND p."kind"=${kind}
      AND p."state"='READY'
      AND p."youtubeVideoId" IS NOT NULL
    ORDER BY p."completedAt" DESC NULLS LAST, p."createdAt" DESC
    LIMIT 1
  `);
  const published = rows[0];
  if (!published?.youtubeVideoId || !published.objectKey) return { synced: false };

  const stored = await fetchRailwayObject({ key: published.objectKey, signal: AbortSignal.timeout(30000) });
  if (!stored.ok) throw new StudioError("Saved thumbnail storage is unavailable.", 503);
  const bytes = Buffer.from(await stored.arrayBuffer());
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new StudioError("Saved thumbnail size is invalid.", 500);

  const accessToken = await youtubeAccessToken();
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/thumbnails/set");
  url.searchParams.set("videoId", published.youtubeVideoId);
  url.searchParams.set("uploadType", "media");
  const upload = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
    signal: AbortSignal.timeout(60000),
  });
  if (!upload.ok) {
    const detail = await upload.json().catch(() => ({})) as { error?: { message?: string } };
    throw new StudioError(detail.error?.message || `YouTube thumbnail update failed (${upload.status}).`, 502);
  }
  return { synced: true, videoId: published.youtubeVideoId };
}

export async function youtubePublishState(fixtureId: string) {
  const rows = await prisma.$queryRaw<PublishRow[]>(Prisma.sql`SELECT DISTINCT ON ("kind") "id","kind","state","title","privacyStatus","youtubeVideoId","youtubeUrl","error","createdAt","completedAt" FROM "SixflTvYoutubePublish" WHERE "fixtureId"=${fixtureId} ORDER BY "kind","createdAt" DESC,"id" DESC`);
  return rows.map(row => ({ id: row.id, kind: row.kind, state: row.state, title: row.title, privacyStatus: row.privacyStatus, youtubeVideoId: row.youtubeVideoId, youtubeUrl: row.youtubeUrl, error: row.error, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() || null }));
}
