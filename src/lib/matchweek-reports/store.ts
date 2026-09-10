import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ReportError, type ReportDraft, type ReportContent, type ReportSource } from "./types";

type Db = Pick<typeof prisma, "$executeRaw" | "$queryRaw">;
type DraftRow = Omit<ReportDraft, "updatedAt"> & { leagueId: string; matchDate: string; updatedAt: Date };
type Revision = { id: string; draftId: string; actorId: string; baseVersion: number; kind: string; status: string; error: string | null; createdAt: Date };
const asDraft = (row: DraftRow | undefined): ReportDraft | null => row ? ({ id: row.id, version: row.version, content: row.content, source: row.source, sourceHash: row.sourceHash, model: row.model, updatedAt: row.updatedAt.toISOString() }) : null;
const pending = async (db: Db, draftId: string) => (await db.$queryRaw<Revision[]>`SELECT * FROM "MatchweekReportRevision" WHERE "draftId"=${draftId} AND "status"='RUNNING' AND "createdAt">NOW()-INTERVAL '2 minutes' LIMIT 1`)[0];
const lock = (db: Db, key: string) => db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const getRow = async (db: Db, leagueId: string, date: string) => (await db.$queryRaw<DraftRow[]>`SELECT * FROM "MatchweekReportDraft" WHERE "leagueId"=${leagueId} AND "matchDate"=${date}`)[0];
export async function readStoredReport(leagueId: string, date: string) {
  const row = await getRow(prisma, leagueId, date);
  if (!row) return { draft: null, generating: false, latestError: null };
  const last = (await prisma.$queryRaw<Revision[]>`SELECT * FROM "MatchweekReportRevision" WHERE "draftId"=${row.id} ORDER BY "createdAt" DESC, "id" DESC LIMIT 1`)[0];
  return { draft: asDraft(row), generating: Boolean(await pending(prisma, row.id)), latestError: last?.status === "FAILED" ? last.error : null };
}
export type GenerationInput = { actorId: string; requestId: string; baseVersion: number; source: ReportSource; sourceHash: string; model: string };
export async function claimGeneration(input: GenerationInput) {
  return prisma.$transaction(async tx => {
    await lock(tx, `matchweek-actor:${input.actorId}`);
    await lock(tx, `matchweek:${input.source.leagueId}:${input.source.matchDate}`);
    const prior = (await tx.$queryRaw<Revision[]>`SELECT * FROM "MatchweekReportRevision" WHERE "id"=${input.requestId}`)[0];
    if (prior) {
      const row = await getRow(tx, input.source.leagueId, input.source.matchDate);
      if (prior.actorId !== input.actorId || prior.draftId !== row?.id || prior.kind !== "AI" || prior.baseVersion !== input.baseVersion) throw new ReportError("This request reference has already been used. Reload the report.", 409);
      if (prior.status === "COMPLETE") return { cached: true as const, draftId: row!.id };
      throw new ReportError(prior.status === "RUNNING" ? "This generation was already requested. Check saved status before starting another." : prior.error || "This request already failed. Use Generate again for a new request.", 409);
    }
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "MatchweekReportDraft" ("id","leagueId","matchDate") VALUES (${id},${input.source.leagueId},${input.source.matchDate}) ON CONFLICT ("leagueId","matchDate") DO NOTHING`;
    const row = (await getRow(tx, input.source.leagueId, input.source.matchDate))!;
    if (row.version !== input.baseVersion) throw new ReportError("A newer draft has been saved. Check saved status before generating again.", 409);
    if (await pending(tx, row.id)) throw new ReportError("A report is already being generated for this night. Check saved status shortly.", 409);
    const counts = await tx.$queryRaw<Array<{ recent: number; daily: number }>>`
      SELECT COUNT(*) FILTER (WHERE "draftId"=${row.id} AND "createdAt">NOW()-INTERVAL '30 seconds')::int AS recent,
        COUNT(*) FILTER (WHERE "actorId"=${input.actorId} AND "createdAt">NOW()-INTERVAL '24 hours')::int AS daily
      FROM "MatchweekReportRevision" WHERE "kind"='AI'
    `;
    if (counts[0]?.recent || counts[0]?.daily >= 50) throw new ReportError("Generation limit reached. Wait at least 30 seconds between attempts; each administrator can generate up to 50 reports in 24 hours.", 429);
    await tx.$executeRaw`UPDATE "MatchweekReportRevision" SET "status"='FAILED',"error"='The previous request did not finish. No automatic retry was made.',"updatedAt"=NOW() WHERE "draftId"=${row.id} AND "status"='RUNNING'`;
    await tx.$executeRaw`INSERT INTO "MatchweekReportRevision" ("id","draftId","actorId","baseVersion","kind","status","source","sourceHash","model") VALUES (${input.requestId},${row.id},${input.actorId},${input.baseVersion},'AI','RUNNING',${JSON.stringify(input.source)}::jsonb,${input.sourceHash},${input.model})`;
    return { cached: false as const, draftId: row.id };
  });
}
export async function finishGeneration(input: GenerationInput, draftId: string, content: ReportContent) {
  await prisma.$transaction(async tx => {
    await lock(tx, `matchweek:${input.source.leagueId}:${input.source.matchDate}`);
    const row = await getRow(tx, input.source.leagueId, input.source.matchDate);
    const attempt = (await tx.$queryRaw<Revision[]>`SELECT * FROM "MatchweekReportRevision" WHERE "id"=${input.requestId}`)[0];
    if (!row || row.version !== input.baseVersion || attempt?.status !== "RUNNING" || attempt.draftId !== draftId) throw new ReportError("The draft changed while OpenAI was writing. The newer saved version was not overwritten.", 409);
    const version = row.version + 1;
    await tx.$executeRaw`UPDATE "MatchweekReportRevision" SET "status"='COMPLETE',"content"=${JSON.stringify(content)}::jsonb,"version"=${version},"updatedAt"=NOW() WHERE "id"=${input.requestId}`;
    await tx.$executeRaw`UPDATE "MatchweekReportDraft" SET "version"=${version},"content"=${JSON.stringify(content)}::jsonb,"source"=${JSON.stringify(input.source)}::jsonb,"sourceHash"=${input.sourceHash},"model"=${input.model},"updatedAt"=NOW() WHERE "id"=${draftId}`;
  });
}
export async function failGeneration(requestId: string, message: string) {
  await prisma.$executeRaw`UPDATE "MatchweekReportRevision" SET "status"='FAILED',"error"=${message},"updatedAt"=NOW() WHERE "id"=${requestId} AND "status"='RUNNING'`;
}
export async function storeEditedReport(input: { actorId: string; requestId: string; leagueId: string; matchDate: string; baseVersion: number; content: ReportContent }) {
  await prisma.$transaction(async tx => {
    await lock(tx, `matchweek:${input.leagueId}:${input.matchDate}`);
    const row = await getRow(tx, input.leagueId, input.matchDate);
    if (!row?.source || !row.content) throw new ReportError("Generate a report before saving edits.");
    const prior = (await tx.$queryRaw<Array<Revision & { content: ReportContent }>>`SELECT * FROM "MatchweekReportRevision" WHERE "id"=${input.requestId}`)[0];
    if (prior) {
      if (prior.actorId === input.actorId && prior.draftId === row.id && prior.kind === "EDIT" && prior.baseVersion === input.baseVersion && JSON.stringify(prior.content) === JSON.stringify(input.content)) return;
      // JSONB can reorder keys; compare parsed fields rather than serialisation.
      if (prior.actorId === input.actorId && prior.draftId === row.id && prior.kind === "EDIT" && prior.baseVersion === input.baseVersion && prior.content.title === input.content.title && prior.content.introduction === input.content.introduction && prior.content.closing === input.content.closing && prior.content.matches.every((m, i) => m.fixtureId === input.content.matches[i]?.fixtureId && m.paragraph === input.content.matches[i]?.paragraph) && prior.content.matches.length === input.content.matches.length) return;
      throw new ReportError("This save reference has already been used. Check saved status.", 409);
    }
    if (row.version !== input.baseVersion) throw new ReportError("Someone saved a newer version. Your text is kept on screen. Copy it before checking saved status.", 409);
    if (await pending(tx, row.id)) throw new ReportError("Wait for the current generation to finish before saving edits.", 409);
    const version = row.version + 1;
    await tx.$executeRaw`INSERT INTO "MatchweekReportRevision" ("id","draftId","actorId","baseVersion","version","kind","status","content","source","sourceHash","model") VALUES (${input.requestId},${row.id},${input.actorId},${input.baseVersion},${version},'EDIT','COMPLETE',${JSON.stringify(input.content)}::jsonb,${JSON.stringify(row.source)}::jsonb,${row.sourceHash!},${row.model})`;
    await tx.$executeRaw`UPDATE "MatchweekReportDraft" SET "version"=${version},"content"=${JSON.stringify(input.content)}::jsonb,"updatedAt"=NOW() WHERE "id"=${row.id}`;
  });
}
