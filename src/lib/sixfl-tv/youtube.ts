import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { StudioError, studioFixture, type SixflTvRenderKind } from "./studio";

const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const YOUTUBE_READ_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

type Connection = { refreshTokenCiphertext: string; channelId: string | null; channelTitle: string | null; scope: string };
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
export function createYoutubeState(fixtureId: string) {
  const payload = encode(JSON.stringify({ fixtureId, exp: Date.now() + 10 * 60 * 1000, nonce: randomUUID() }));
  return `${payload}.${signState(payload)}`;
}
export function verifyYoutubeState(value: string) {
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new StudioError("YouTube authorisation expired. Start again.", 400);
  const expected = decode(signState(payload)), actual = decode(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new StudioError("YouTube authorisation could not be verified.", 400);
  const parsed = JSON.parse(decode(payload).toString("utf8")) as { fixtureId?: unknown; exp?: unknown };
  if (typeof parsed.fixtureId !== "string" || !parsed.fixtureId || typeof parsed.exp !== "number" || parsed.exp < Date.now()) throw new StudioError("YouTube authorisation expired. Start again.", 400);
  return parsed.fixtureId;
}
export function youtubeAuthorisationUrl(fixtureId: string) {
  const cfg = config(), url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", cfg.clientId); url.searchParams.set("redirect_uri", cfg.redirectUri); url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READ_SCOPE}`); url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent");
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
  const fixtureId = verifyYoutubeState(state); await studioFixture(fixtureId);
  const cfg = config();
  const token = await tokenRequest(new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" }));
  if (!token.refresh_token) throw new StudioError("Google did not return a refresh token. Remove the app from your Google account permissions and connect it again.", 409);
  const channel = await channelFor(token.access_token!);
  if (!channel.id) throw new StudioError("Google authorised the account, but no YouTube channel was found for it.", 409);
  await prisma.$executeRaw`
    INSERT INTO "SixflTvYoutubeConnection" ("id","refreshTokenCiphertext","channelId","channelTitle","scope","connectedByActor")
    VALUES ('primary',${encrypt(token.refresh_token)},${channel.id},${channel.title},${token.scope || `${YOUTUBE_UPLOAD_SCOPE} ${YOUTUBE_READ_SCOPE}`},${actor})
    ON CONFLICT ("id") DO UPDATE SET "refreshTokenCiphertext"=EXCLUDED."refreshTokenCiphertext","channelId"=EXCLUDED."channelId","channelTitle"=EXCLUDED."channelTitle","scope"=EXCLUDED."scope","connectedByActor"=EXCLUDED."connectedByActor","connectedAt"=NOW(),"updatedAt"=NOW()`;
  return fixtureId;
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
  const active = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SixflTvYoutubePublish" WHERE "fixtureId"=${fixtureId} AND "kind"=${kind} AND "state" IN ('QUEUED','PROCESSING') LIMIT 1`;
  if (active[0]) throw new StudioError("This video is already being uploaded to YouTube.", 409);
  const failed = await prisma.$queryRaw<{ id: string; renderJobId: string }[]>`
    SELECT "id","renderJobId" FROM "SixflTvYoutubePublish" WHERE "fixtureId"=${fixtureId} AND "kind"=${kind} AND "state"='FAILED' ORDER BY "createdAt" DESC LIMIT 1`;
  if (failed[0]?.renderJobId === render[0].id) {
    await prisma.$executeRaw`UPDATE "SixflTvYoutubePublish" SET "state"='QUEUED',"thumbnailObjectKey"=${thumb[0].objectKey},"requestedByActor"=${actor},"error"=NULL,"busyUntil"=NULL,"updatedAt"=NOW() WHERE "id"=${failed[0].id}`;
    return { id: failed[0].id, kind, state: "QUEUED", privacyStatus: "private", resumed: true };
  }
  const titleDefault = `${fixture.homeTeam.name} v ${fixture.awayTeam.name} | ${kind === "HIGHLIGHTS" ? "Highlights" : "Full Match"} | SIXFL TV`;
  const descriptionDefault = `${fixture.league.name}\n${new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "Europe/London" }).format(fixture.kickoffAt)}\n\nSIXFL TV · sixfl.co.uk`;
  const title = cleanTitle(data.title || titleDefault, 100), description = cleanDescription(data.description || descriptionDefault, 5000);
  if (!title) throw new StudioError("Add a YouTube title.");
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "SixflTvYoutubePublish" ("id","fixtureId","kind","renderJobId","thumbnailObjectKey","title","description","privacyStatus","requestedByActor")
    VALUES (${id},${fixtureId},${kind},${render[0].id},${thumb[0].objectKey},${title},${description},'private',${actor})`;
  return { id, kind, state: "QUEUED", privacyStatus: "private", resumed: false };
}
export async function youtubePublishState(fixtureId: string) {
  const rows = await prisma.$queryRaw<PublishRow[]>(Prisma.sql`SELECT DISTINCT ON ("kind") "id","kind","state","title","privacyStatus","youtubeVideoId","youtubeUrl","error","createdAt","completedAt" FROM "SixflTvYoutubePublish" WHERE "fixtureId"=${fixtureId} ORDER BY "kind","createdAt" DESC,"id" DESC`);
  return rows.map(row => ({ id: row.id, kind: row.kind, state: row.state, title: row.title, privacyStatus: row.privacyStatus, youtubeVideoId: row.youtubeVideoId, youtubeUrl: row.youtubeUrl, error: row.error, createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() || null }));
}
