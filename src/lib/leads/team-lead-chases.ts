import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TEAM_LEAD_CHASE_SOURCES, TEAM_LEAD_CHASE_TEMPLATES, TEAM_LEAD_STOP_REASON, teamLeadChaseId, type LeadChaseReference } from "./team-lead-chase-policy";

type ReadDb = Pick<Prisma.TransactionClient, "$queryRaw">;
type WriteDb = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

/** Alias d is a dispatch. Exact lead ID + purpose, never matching by shared phone/email. */
function chaseScope() {
  return Prisma.sql`(
    d."sourceType" IN (${Prisma.join(TEAM_LEAD_CHASE_SOURCES)}) OR
    (d."sourceType" = 'LEAD' AND (
      d."metadata"->>'templateKey' IN (${Prisma.join(TEAM_LEAD_CHASE_TEMPLATES)}) OR
      d."metadata"->>'ctaUrlKey' = 'teamConfirmationUrl' OR
      POSITION('/team-confirmation/' IN COALESCE(d."metadata"->>'ctaUrl', '')) > 0 OR
      EXISTS (SELECT 1 FROM "NotificationTemplate" t WHERE t."id" = d."templateId"
        AND (t."key" IN (${Prisma.join(TEAM_LEAD_CHASE_TEMPLATES)}) OR t."ctaUrlKey" = 'teamConfirmationUrl'))
    ))
  )`;
}
function noProviderAcceptance() {
  return Prisma.sql`d."sentAt" IS NULL AND d."providerMessageId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "NotificationAttempt" a WHERE a."dispatchId" = d."id" AND a."status"::text = 'SUCCESS')
    AND NOT EXISTS (SELECT 1 FROM "MessageEntry" m WHERE m."notificationDispatchId" = d."id"
      AND (m."sentAt" IS NOT NULL OR m."providerMessageId" IS NOT NULL))`;
}
export async function getTeamLeadChaseBlockReason(input: LeadChaseReference, db: ReadDb = prisma) {
  const leadId = teamLeadChaseId(input);
  if (!leadId) return null;
  const [row] = await db.$queryRaw<Array<{ status: string; decision: string | null }>>(Prisma.sql`
    SELECT lead."status"::text AS status, confirmation."status"::text AS decision
    FROM "InterestLead" lead LEFT JOIN "LeadTeamConfirmation" confirmation ON confirmation."leadId" = lead."id"
    WHERE lead."id" = ${leadId} AND lead."interestType"::text = 'TEAM'
  `);
  if (!row) return "Team lead no longer exists; registration follow-up blocked.";
  return row.status === "CLOSED" || row.decision === "DECLINED" ? TEAM_LEAD_STOP_REASON : null;
}

async function cancelMatching(db: WriteDb, where: Prisma.Sql, statuses: string[]) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "NotificationDispatch" d
    SET "status" = 'CANCELLED', "cancelledAt" = NOW(), "updatedAt" = NOW(), "failureReason" = ${TEAM_LEAD_STOP_REASON}
    WHERE ${where} AND ${chaseScope()} AND d."status"::text IN (${Prisma.join(statuses)})
      AND ${noProviderAcceptance()}
    RETURNING d."id"
  `);
  if (rows.length) {
    await db.$executeRaw(Prisma.sql`
      UPDATE "MessageEntry" SET "providerStatus" = 'CANCELLED', "updatedAt" = NOW()
      WHERE "notificationDispatchId" IN (${Prisma.join(rows.map(row => row.id))})
        AND "direction"::text = 'OUTBOUND' AND "sentAt" IS NULL AND "providerMessageId" IS NULL
    `);
  }
  return rows.length;
}
export async function cancelUnsentTeamLeadChases(leadId: string, db: WriteDb = prisma) {
  const where = Prisma.sql`d."sourceId" = ${leadId}`;
  // Never relabel a worker's in-flight request as definitely unsent. Its final gate checks the decision.
  const cancelledCount = await cancelMatching(db, where, ["QUEUED", "FAILED"]);
  const [row] = await db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::int AS count FROM "NotificationDispatch" d
    WHERE ${where} AND ${chaseScope()} AND d."status"::text = 'PROCESSING'
  `);
  return { cancelledCount, processingCount: row?.count ?? 0 };
}

/** Includes future quiet-hours chases, so old declined leads cannot leave stale queues behind. */
export async function cancelStoppedTeamLeadChases() {
  return prisma.$transaction(tx => cancelMatching(tx, Prisma.sql`
    EXISTS (SELECT 1 FROM "InterestLead" lead
      LEFT JOIN "LeadTeamConfirmation" confirmation ON confirmation."leadId" = lead."id"
      WHERE lead."id" = d."sourceId" AND lead."interestType"::text = 'TEAM'
        AND (lead."status"::text = 'CLOSED' OR confirmation."status"::text = 'DECLINED'))
  `, ["QUEUED", "FAILED"]));
}

/** Called by the owning processor immediately before EACH provider submission. */
export async function applyTeamLeadChaseDeliveryGate(dispatch: LeadChaseReference & { id: string }) {
  const reason = await getTeamLeadChaseBlockReason(dispatch);
  if (!reason) return null;
  await prisma.$transaction(tx => cancelMatching(tx, Prisma.sql`d."id" = ${dispatch.id}`, ["QUEUED", "PROCESSING", "FAILED"]));
  return reason;
}
