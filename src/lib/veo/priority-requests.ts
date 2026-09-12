import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { VEO_SUPPLEMENT_PENCE } from './allocator';

export const VEO_REQUEST_TERMS = 'veo-priority-v1';
export type VeoRequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED';
export type VeoRequest = {
  id: string; leagueId: string; teamId: string; requestedBy: string; requestedAt: Date;
  status: VeoRequestStatus; supplementPence: number; termsVersion: string;
};
export type VeoOffer = { priority: boolean; request: VeoRequest | null };
export class VeoRequestError extends Error {}
type Db = Pick<typeof prisma, '$queryRaw' | '$executeRaw'>;

function validId(value: string) {
  if (!value || value.length > 200) throw new VeoRequestError('The team or league could not be identified. Refresh and try again.');
}
async function transaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error) {
      // Simultaneous requests can hit the partial unique index while the second
      // serializable transaction still sees its older snapshot. Roll it back and
      // reread in a new transaction; never bypass the one-pending-request index.
      const retry = error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || (error.code === 'P2010' && ['40001', '40P01', '23505'].includes(String(error.meta?.code))));
      if (!retry || attempt >= 2) throw error;
    }
  }
}
async function lockTeam(db: Db, leagueId: string, teamId: string) {
  validId(leagueId); validId(teamId);
  await db.$queryRaw`SELECT id FROM "League" WHERE id = ${leagueId} FOR UPDATE`;
  await db.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
}
async function audit(db: Db, leagueId: string, teamId: string, actorId: string, details: object) {
  await db.$executeRaw`INSERT INTO "VeoSettingsAudit" (id, "leagueId", "teamId", "actorId", details)
    VALUES (${randomUUID()}, ${leagueId}, ${teamId}, ${actorId}, ${JSON.stringify(details)}::jsonb)`;
}
/** Exact current-season membership only. A removed season member cannot fall back
 * to Team.leagueId. Legacy leagues without any season membership rows still work. */
async function eligibleTeam(db: Db, leagueId: string, teamId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "Team" t JOIN "League" l ON l.id = ${leagueId}
    JOIN "VeoLeagueSettings" v ON v."leagueId" = l.id AND v.enabled
    LEFT JOIN "LeagueCompetition" c ON c.id = l."competitionId"
    WHERE t.id = ${teamId} AND l."isActive" AND NOT t."isFixturePlaceholder"
      AND t."teamMode"::text = 'STANDARD'
      AND (c."currentLeagueId" IS NULL OR c."currentLeagueId" = l.id)
      AND (EXISTS (SELECT 1 FROM "LeagueSeasonTeam" m WHERE m."leagueId" = l.id AND m."teamId" = t.id AND m."isActive")
        OR (t."leagueId" = l.id AND NOT EXISTS (SELECT 1 FROM "LeagueSeasonTeam" m WHERE m."leagueId" = l.id)))
  `;
  return rows.length === 1;
}
async function assertCaptain(db: Db, teamId: string, actorId: string) {
  validId(actorId);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT m.id FROM "TeamMember" m JOIN "User" u ON u.id = m."userId"
    WHERE m."teamId" = ${teamId} AND m."userId" = ${actorId} AND m.role::text = 'CAPTAIN'
      AND COALESCE(m."isActive", true) AND u.role::text <> 'ADMIN' FOR UPDATE OF m
  `;
  if (!rows.length) throw new VeoRequestError('Only an active captain of this team can request Veo Priority.');
}
async function assertAdmin(db: Db, actorId: string) {
  validId(actorId);
  const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ${actorId} AND role::text = 'ADMIN'`;
  if (!rows.length) throw new VeoRequestError('Administrator access is required to review this request.');
}
async function enabled(db: Db, leagueId: string, teamId: string) {
  const rows = await db.$queryRaw<{ enabled: boolean }[]>`SELECT enabled FROM "VeoTeamPriority" WHERE "leagueId" = ${leagueId} AND "teamId" = ${teamId}`;
  return rows[0]?.enabled === true;
}
export async function readVeoOffer(leagueId: string | null, teamId: string, db: Db = prisma): Promise<VeoOffer | null> {
  if (!leagueId || !await eligibleTeam(db, leagueId, teamId)) return null;
  const requests = await db.$queryRaw<VeoRequest[]>`
    SELECT * FROM "VeoPriorityRequest" WHERE "leagueId" = ${leagueId} AND "teamId" = ${teamId}
    ORDER BY (status = 'PENDING') DESC, "requestedAt" DESC, id DESC LIMIT 1
  `;
  return { priority: await enabled(db, leagueId, teamId), request: requests[0] ?? null };
}
export async function requestVeoPriority(input: { leagueId: string; teamId: string; actorId: string; agreed: boolean; termsVersion: string }) {
  if (!input.agreed || input.termsVersion !== VEO_REQUEST_TERMS) throw new VeoRequestError('Please agree to the £5 allocated-match supplement before requesting Priority.');
  return transaction(async db => {
    const { leagueId, teamId, actorId } = input;
    await lockTeam(db, leagueId, teamId);
    await assertCaptain(db, teamId, actorId);
    const offer = await readVeoOffer(leagueId, teamId, db);
    if (!offer) throw new VeoRequestError('Veo Priority is not currently available for this team in this league.');
    if (offer.priority) return 'ON' as const;
    if (offer.request?.status === 'PENDING') return 'PENDING' as const;
    if (offer.request?.status === 'DECLINED') throw new VeoRequestError('Your request was not approved. Please contact SIXFL to discuss it.');
    const id = randomUUID();
    await db.$executeRaw`INSERT INTO "VeoPriorityRequest" (id, "leagueId", "teamId", "requestedBy", "supplementPence", "termsVersion")
      VALUES (${id}, ${leagueId}, ${teamId}, ${actorId}, ${VEO_SUPPLEMENT_PENCE}, ${VEO_REQUEST_TERMS})`;
    await audit(db, leagueId, teamId, actorId, { kind: 'captain_priority_request', requestId: id, supplementPence: VEO_SUPPLEMENT_PENCE, termsVersion: VEO_REQUEST_TERMS, agreed: true });
    return 'PENDING' as const;
  });
}
/** Reused by the existing admin toggle so manual approval cannot leave a request pending. */
export async function approvePendingVeoRequests(db: Db, leagueId: string, teamId: string, actorId: string) {
  await db.$executeRaw`UPDATE "VeoPriorityRequest" SET status = 'APPROVED', "reviewedBy" = ${actorId}, "reviewedAt" = NOW()
    WHERE "leagueId" = ${leagueId} AND "teamId" = ${teamId} AND status = 'PENDING'`;
}
export async function reviewVeoPriorityRequest(input: { leagueId: string; requestId: string; actorId: string; decision: 'APPROVED' | 'DECLINED' }) {
  validId(input.requestId);
  if (!['APPROVED', 'DECLINED'].includes(input.decision)) throw new VeoRequestError('Choose Approve or Decline.');
  return transaction(async db => {
    await assertAdmin(db, input.actorId);
    const rows = await db.$queryRaw<VeoRequest[]>`SELECT * FROM "VeoPriorityRequest" WHERE id = ${input.requestId} AND "leagueId" = ${input.leagueId}`;
    const request = rows[0];
    if (!request) throw new VeoRequestError('Request not found in this league.');
    await lockTeam(db, input.leagueId, request.teamId);
    const current = (await db.$queryRaw<VeoRequest[]>`SELECT * FROM "VeoPriorityRequest" WHERE id = ${request.id} FOR UPDATE`)[0];
    if (!current) throw new VeoRequestError('Request no longer exists. Refresh the page.');
    if (current.status !== 'PENDING') {
      if (current.status !== input.decision) throw new VeoRequestError('Another administrator has already reviewed this request. Refresh to see the decision.');
      return request.teamId; // Retried approval must not re-enable a subsequently disabled team.
    }
    if (input.decision === 'APPROVED') {
      if (current.supplementPence !== VEO_SUPPLEMENT_PENCE || current.termsVersion !== VEO_REQUEST_TERMS) throw new VeoRequestError('The saved agreement needs reviewing before Priority can be enabled.');
      if (!await eligibleTeam(db, input.leagueId, request.teamId)) throw new VeoRequestError('This league is off or the team is no longer eligible. Do not approve this request.');
      await db.$executeRaw`INSERT INTO "VeoTeamPriority" ("leagueId", "teamId", enabled, "updatedBy")
        VALUES (${input.leagueId}, ${request.teamId}, true, ${input.actorId})
        ON CONFLICT ("leagueId", "teamId") DO UPDATE SET enabled = true, "updatedAt" = NOW(), "updatedBy" = EXCLUDED."updatedBy"`;
    }
    await db.$executeRaw`UPDATE "VeoPriorityRequest" SET status = ${input.decision}, "reviewedBy" = ${input.actorId}, "reviewedAt" = NOW() WHERE id = ${request.id}`;
    await audit(db, input.leagueId, request.teamId, input.actorId, { kind: 'captain_priority_review', requestId: request.id, decision: input.decision, requestedBy: request.requestedBy, supplementPence: request.supplementPence });
    return request.teamId;
  });
}
export async function pendingVeoRequests(leagueId: string) {
  return prisma.$queryRaw<(VeoRequest & { teamName: string })[]>`
    SELECT r.*, t.name AS "teamName" FROM "VeoPriorityRequest" r JOIN "Team" t ON t.id = r."teamId"
    WHERE r."leagueId" = ${leagueId} AND r.status = 'PENDING' ORDER BY r."requestedAt", r.id
  `;
}
export async function pendingVeoRequestCount(leagueId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::integer AS count FROM "VeoPriorityRequest" WHERE "leagueId" = ${leagueId} AND status = 'PENDING'`;
  return rows[0]?.count ?? 0;
}
