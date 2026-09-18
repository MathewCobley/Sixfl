import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

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
export async function readVeoOffer(leagueId: string | null, teamId: string, db: Db = prisma): Promise<VeoOffer | null> {
  if (!leagueId || !await eligibleTeam(db, leagueId, teamId)) return null;
  const requests = await db.$queryRaw<VeoRequest[]>`
    SELECT * FROM "VeoPriorityRequest" WHERE "leagueId" = ${leagueId} AND "teamId" = ${teamId}
    ORDER BY "requestedAt" DESC, id DESC LIMIT 1
  `;
  return { priority: false, request: requests[0] ?? null };
}
export async function requestVeoPriority(_input: { leagueId: string; teamId: string; actorId: string; agreed: boolean; termsVersion: string }) {
  throw new VeoRequestError('Paid Veo Priority has ended. SIXFL TV Priority is now free and earned automatically from your team score.');
}
/** Legacy compatibility only. Paid Priority requests can never be approved again. */
export async function approvePendingVeoRequests(db: Db, leagueId: string, teamId: string, actorId: string) {
  await db.$executeRaw`UPDATE "VeoPriorityRequest" SET status = 'DECLINED', "reviewedBy" = ${actorId}, "reviewedAt" = NOW()
    WHERE "leagueId" = ${leagueId} AND "teamId" = ${teamId} AND status = 'PENDING'`;
}
export async function reviewVeoPriorityRequest(input: { leagueId: string; requestId: string; actorId: string; decision: 'APPROVED' | 'DECLINED' }) {
  validId(input.requestId);
  if (!['APPROVED', 'DECLINED'].includes(input.decision)) throw new VeoRequestError('Choose Approve or Decline.');
  if (input.decision === 'APPROVED') throw new VeoRequestError('Paid Veo Priority has ended. Team priority is now calculated automatically from the SIXFL TV Priority Score.');
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
    await db.$executeRaw`UPDATE "VeoPriorityRequest" SET status = ${input.decision}, "reviewedBy" = ${input.actorId}, "reviewedAt" = NOW() WHERE id = ${request.id}`;
    await audit(db, input.leagueId, request.teamId, input.actorId, { kind: 'captain_priority_review', requestId: request.id, decision: input.decision, requestedBy: request.requestedBy, supplementPence: request.supplementPence });
    return request.teamId;
  });
}
export async function pendingVeoRequests(_leagueId: string) {
  return [] as Array<VeoRequest & { teamName: string }>;
}
export async function pendingVeoRequestCount(_leagueId: string): Promise<number> {
  return 0;
}
