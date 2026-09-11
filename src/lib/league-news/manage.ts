import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/requireAdmin';
import { getReportSource, sourceHash } from '@/lib/matchweek-reports/facts';
import { ReportError, validDate, type ReportContent, type ReportSource } from '@/lib/matchweek-reports/types';
import { buildNewsSnapshot, validateNewsSettings, type NewsFixtureIdentity } from './snapshot';
import { blankNewsSettings, newsPath, type NewsPublicationState, type PublishedNews, type NewsSnapshot } from './types';

type Db = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>;
type Row = { id: string; draftId: string; status: NewsPublicationState['status']; revision: number; settings: unknown;
  snapshot: NewsSnapshot | null; sourceVersion: number | null; publishedAt: Date | null; updatedAt: Date; teamIds: string[] };
type Draft = { id: string; version: number; content: ReportContent | null; source: ReportSource | null; sourceHash: string | null };
const row = async (db: Db, leagueId: string, date: string) => (await db.$queryRaw<Row[]>`SELECT * FROM "LeagueNewsArticle" WHERE "leagueId"=${leagueId} AND "matchDate"=${date}`)[0];
const draft = async (db: Db, leagueId: string, date: string) => (await db.$queryRaw<Draft[]>`SELECT "id","version","content","source","sourceHash" FROM "MatchweekReportDraft" WHERE "leagueId"=${leagueId} AND "matchDate"=${date}`)[0];
const state = (r: Row | undefined, slug: string, date: string): NewsPublicationState => ({
  status: r?.status ?? 'DRAFT', revision: r?.revision ?? 0, sourceVersion: r?.sourceVersion ?? null,
  publishedAt: r?.publishedAt?.toISOString() ?? null, settings: r ? validateNewsSettings(r.settings) : blankNewsSettings(), url: newsPath(slug, date),
});
async function league(slug: string) {
  const l = await prisma.league.findFirst({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!l) throw new ReportError('League not found.', 404);
  return l;
}
async function identities(db: Db, leagueId: string, source: ReportSource): Promise<NewsFixtureIdentity[]> {
  // IDs come from selected fixtures, never from guessing team names in the prose.
  const rows = await db.$queryRaw<Array<{ id: string; aId: string; aName: string; aLogo: string | null; bId: string; bName: string; bLogo: string | null }>>(Prisma.sql`
    SELECT f."id", a."id" AS "aId", a."name" AS "aName", a."logoUrl" AS "aLogo", b."id" AS "bId", b."name" AS "bName", b."logoUrl" AS "bLogo"
    FROM "Fixture" f JOIN "Team" a ON a."id"=f."homeTeamId" JOIN "Team" b ON b."id"=f."awayTeamId"
    WHERE f."leagueId"=${leagueId} AND f."id" IN (${Prisma.join(source.matches.map(m => m.fixtureId))})
  `);
  return rows.map(r => ({ id: r.id, homeTeam: { id: r.aId, name: r.aName, logoUrl: r.aLogo }, awayTeam: { id: r.bId, name: r.bName, logoUrl: r.bLogo } }));
}
function ready(d: Draft | undefined, source: ReportSource | null, version: number, hash?: string) {
  if (!d?.content || !d.source || !source?.matches.length) throw new ReportError('Generate and save a report before previewing or publishing.');
  if (d.version !== version) throw new ReportError('A newer draft exists. Check saved status before publishing.', 409);
  const currentHash = sourceHash(source);
  if (d.sourceHash !== currentHash || (hash !== undefined && hash !== currentHash)) throw new ReportError('This draft is out of date. Check saved status and regenerate from the current results before publishing.', 409);
  return d as Draft & { content: ReportContent; source: ReportSource };
}
/** All exported administrative entry points authorise before reading anything. */
export async function getNewsPublicationState(slug: string, date: string) {
  await requireAdmin();
  const matchDate = validDate(date), l = await league(slug);
  return state(await row(prisma, l.id, matchDate), slug, matchDate);
}
export async function previewNews(slug: string, date: string, version: number, revision: number): Promise<PublishedNews> {
  await requireAdmin();
  const matchDate = validDate(date), l = await league(slug);
  const source = await getReportSource(slug, matchDate);
  const d = ready(await draft(prisma, l.id, matchDate), source, version);
  const publication = await row(prisma, l.id, matchDate);
  if ((publication?.revision ?? 0) !== revision) throw new ReportError('The photo or publication settings changed. Return to the editor and preview again.', 409);
  const article = buildNewsSnapshot(source!, d.content, await identities(prisma, l.id, source!), publication ? validateNewsSettings(publication.settings) : blankNewsSettings());
  return { id: d.id, leagueSlug: slug, publishedAt: publication?.publishedAt?.toISOString() ?? new Date().toISOString(), updatedAt: new Date().toISOString(), article };
}
export async function manageNewsPublication(slug: string, value: unknown) {
  const access = await requireAdmin();
  const identity = access.user?.id || access.session?.user?.email;
  if (!identity) throw new ReportError('Sign in as an administrator.', 401);
  const actorId = createHash('sha256').update(identity).digest('hex');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReportError('Invalid publishing request.');
  const v = value as Record<string, unknown>;
  const kind = v.action === 'news-settings' ? 'settings' : v.action;
  if (kind !== 'publish' && kind !== 'unpublish' && kind !== 'settings') throw new ReportError('Choose a publishing action.');
  if (typeof v.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.requestId)) throw new ReportError('Invalid request reference.');
  if (!Number.isSafeInteger(v.revision) || (v.revision as number) < 0 || !Number.isSafeInteger(v.draftVersion) || (v.draftVersion as number) < 1) throw new ReportError('Reload the publishing controls.');
  const date = validDate(v.matchDate), l = await league(slug), requestId = v.requestId;
  const settings = kind === 'settings' ? validateNewsSettings(v.settings) : null;
  const fingerprint = createHash('sha256').update(JSON.stringify({ slug, date, kind, revision: v.revision, draftVersion: v.draftVersion, sourceHash: v.sourceHash, settings })).digest('hex');
  const touched = await prisma.$transaction(async tx => {
    // Same lock as draft save/generation: a concurrent draft cannot be published accidentally.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`matchweek:${l.id}:${date}`}, 0))`;
    const prior = (await tx.$queryRaw<Array<{ actorId: string; fingerprint: string }>>`SELECT "actorId","fingerprint" FROM "LeagueNewsEvent" WHERE "requestId"=${requestId}`)[0];
    const existing = await row(tx, l.id, date);
    if (prior) {
      if (prior.actorId !== actorId || prior.fingerprint !== fingerprint) throw new ReportError('This request reference was already used for another action.', 409);
      // A replay must never resurrect an article that was since unpublished.
      return existing?.teamIds ?? [];
    }
    if ((existing?.revision ?? 0) !== v.revision) throw new ReportError('The publication changed in another tab. Refresh publication status before trying again.', 409);
    const saved = await draft(tx, l.id, date);
    if (!saved?.content || !saved.source) throw new ReportError('Generate and save a draft first.');
    let snapshot: NewsSnapshot | null = null;
    if (kind === 'publish') {
      if (typeof v.sourceHash !== 'string') throw new ReportError('Reload the current report facts.', 409);
      const source = await getReportSource(slug, date);
      const d = ready(saved, source, v.draftVersion as number, v.sourceHash);
      const running = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "MatchweekReportRevision" WHERE "draftId"=${saved.id} AND "status"='RUNNING' AND "createdAt">NOW()-INTERVAL '2 minutes' LIMIT 1`;
      if (running.length) throw new ReportError('Wait for generation to finish before publishing.', 409);
      snapshot = buildNewsSnapshot(source!, d.content, await identities(tx, l.id, source!), existing ? validateNewsSettings(existing.settings) : blankNewsSettings());
    }
    if (kind === 'settings' && saved.version !== v.draftVersion) throw new ReportError('A newer draft exists. Check saved status first.', 409);
    if (kind === 'unpublish' && existing?.status !== 'PUBLISHED') throw new ReportError('This article is not currently published.', 409);
    const id = existing?.id ?? randomUUID(), revision = (existing?.revision ?? 0) + 1;
    if (!existing) await tx.$executeRaw`INSERT INTO "LeagueNewsArticle" ("id","draftId","leagueId","matchDate") VALUES (${id},${saved.id},${l.id},${date})`;
    if (kind === 'settings') await tx.$executeRaw`UPDATE "LeagueNewsArticle" SET "settings"=${JSON.stringify(settings)}::jsonb,"revision"=${revision},"updatedAt"=NOW() WHERE "id"=${id}`;
    const teamIds = snapshot ? [...new Set(snapshot.matches.flatMap(m => [m.teamAId, m.teamBId]))] : existing?.teamIds ?? [];
    if (kind === 'publish') await tx.$executeRaw`UPDATE "LeagueNewsArticle" SET "status"='PUBLISHED',"snapshot"=${JSON.stringify(snapshot)}::jsonb,"teamIds"=${teamIds}::text[],"sourceVersion"=${saved.version},"revision"=${revision},"publishedAt"=COALESCE("publishedAt",NOW()),"publishedUpdatedAt"=NOW(),"updatedAt"=NOW() WHERE "id"=${id}`;
    if (kind === 'unpublish') await tx.$executeRaw`UPDATE "LeagueNewsArticle" SET "status"='UNPUBLISHED',"revision"=${revision},"updatedAt"=NOW() WHERE "id"=${id}`;
    await tx.$executeRaw`INSERT INTO "LeagueNewsEvent" ("requestId","articleId","actorId","fingerprint","kind","revision","snapshot") VALUES (${requestId},${id},${actorId},${fingerprint},${kind},${revision},${snapshot ? JSON.stringify(snapshot) : null}::jsonb)`;
    return [...new Set([...teamIds, ...(existing?.teamIds ?? [])])];
  }, { timeout: 20000 });
  if (kind !== 'settings') {
    revalidatePath(`/leagues/${slug}`, 'layout'); revalidatePath('/sitemap.xml');
    for (const id of touched) {
      revalidatePath(`/teams/${id}`, 'layout'); revalidatePath(`/captain/team/${id}`, 'layout'); revalidatePath(`/player/team/${id}`, 'layout');
    }
  }
  return state(await row(prisma, l.id, date), slug, date);
}
