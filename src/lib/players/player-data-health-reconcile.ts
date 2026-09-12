import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensurePlayerDataHealthChangeTable, recordPlayerDataHealthChange } from "./player-data-health-audit";
import { getPlayerRecruitmentMatches, hasLiveRecruitment, type RecruitmentMatch } from "./player-data-health-matches";

export function emptyHealthChanges() {
  return { changed: false, prospectsActivated: 0, prospectsClosedAsDuplicate: 0,
    playerPoolProfilesJoined: 0, requestsJoined: 0, requestsClosed: 0, leadsClosed: 0 };
}

/** Recruitment-only reconciliation. User, TeamMember, performance and payments are never written. */
export async function reconcileRecruitmentMatch(input: {
  match: RecruitmentMatch; runId: string; actorUserId?: string | null;
  confirmation?: { userId: string; actorUserId: string; reason: string };
}) {
  await ensurePlayerDataHealthChangeTable();
  return prisma.$transaction(async (db) => {
    const { record } = input.match;
    if (record.kind === "PROSPECT") {
      // Match the queue's lock order: profile first, then the owning prospect.
      if (record.profileId) await db.$queryRaw`SELECT id FROM "PlayerPoolProfile" WHERE id=${record.profileId} FOR UPDATE`;
      await db.$queryRaw`SELECT id FROM "TeamPlayerProspect" WHERE id=${record.id} FOR UPDATE`;
    } else await db.$queryRaw`SELECT id FROM "InterestLead" WHERE id=${record.id} FOR UPDATE`;
    const fresh = (await getPlayerRecruitmentMatches(db)).find(m => m.record.kind === record.kind && m.record.id === record.id);
    if (!fresh || !hasLiveRecruitment(fresh.record)) return emptyHealthChanges();
    const manual = input.confirmation;
    if (manual && fresh.fingerprint !== input.match.fingerprint) throw new Error("This record or its squad matches changed. Refresh and review again.");
    if (!manual && (!fresh.safe || fresh.fingerprint !== input.match.fingerprint)) return emptyHealthChanges();
    const candidate = manual ? fresh.candidates.find(c => c.userId === manual.userId) : fresh.candidates[0];
    if (!candidate) throw new Error("The selected squad account is no longer a matching candidate.");
    if (manual) {
      const actor = await db.user.findUnique({ where: { id: manual.actorUserId }, select: { id: true, role: true } });
      if (actor?.role !== "ADMIN") throw new Error("Administrator access is required to confirm an identity match.");
      if (manual.reason.trim().length < 10 || manual.reason.length > 1000) throw new Error("Record how you verified this is the same person (10–1000 characters).");
    }
    // A concurrent user/membership edit causes SERIALIZABLE rollback, not a stale match being applied.
    const current = fresh.record;
    const reason = manual
      ? `Confirmed same person by admin ${manual.actorUserId}: ${manual.reason.trim()}. ${candidate.evidence.join('; ')}`
      : `${input.actorUserId ? `Safe cleanup requested by admin ${input.actorUserId}. ` : ""}${candidate.evidence.join('; ')}. Registered with ${candidate.teams.map(t => t.name).join(', ')}; recruitment fulfilled.`;
    const counts = emptyHealthChanges();
    const log = async (recordType: string, recordId: string, label: string, previous: string, next: string) => {
      await recordPlayerDataHealthChange({ runId: input.runId, userId: candidate.userId,
        playerName: candidate.name, email: candidate.email, teamNames: candidate.teams.map(t => t.name).join(', '),
        recordType, recordId, recordLabel: label, previousStatus: previous, newStatus: next, reason }, db);
    };
    if (current.kind === "LEAD") {
      await db.$executeRaw`UPDATE "InterestLead" SET status='CLOSED', "closedAt"=COALESCE("closedAt", NOW()), "updatedAt"=NOW()
        WHERE id=${current.id} AND "interestType"='PLAYER' AND status<>'CLOSED'`;
      await log("LEAD", current.id, "Player lead", current.status, "CLOSED");
      counts.leadsClosed++;
    } else {
      const sameTeam = candidate.teams.some(t => t.id === current.teamId);
      // A deliberate different-team enquiry is never deactivated by this workflow.
      if ((sameTeam || !current.teamId) && !["DECLINED", "NOT_LOOKING", "NOT_INTERESTED", "CLOSED"].includes(current.status)) {
        const next = sameTeam ? "ACTIVE_SQUAD" : "DUPLICATE";
        if (current.status !== next) {
          await db.$executeRaw`UPDATE "TeamPlayerProspect" SET status=${next},
            notes=CONCAT_WS(E'\n', NULLIF(notes,''), ${'Player data health: ' + reason}), "updatedAt"=NOW() WHERE id=${current.id}`;
          await log("PROSPECT", current.id, current.teamName ? `Prospect · ${current.teamName}` : "Unassigned prospect", current.status, next);
          if (sameTeam) counts.prospectsActivated++; else counts.prospectsClosedAsDuplicate++;
        }
      }
      if (current.profileId && current.profileStatus && !["JOINED", "PAUSED", "NOT_LOOKING", "DECLINED", "CLOSED"].includes(current.profileStatus)) {
        await db.$executeRaw`UPDATE "PlayerPoolProfile" SET status='JOINED', "updatedAt"=NOW() WHERE id=${current.profileId}`;
        await log("PLAYER_POOL", current.profileId, `PlayerPool ${current.publicCode}`, current.profileStatus, "JOINED");
        counts.playerPoolProfilesJoined++;
        // Preserve sent/provider-accepted evidence and unrelated squad/payment messages.
        const cancelled = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
          SELECT id, status::text FROM "NotificationDispatch" WHERE "sourceId"=${current.profileId}
          AND "sourceType" IN ('PLAYER_POOL_PROFILE_INVITE','PLAYER_POOL_PROFILE_NUDGE','PLAYER_POOL_PROFILE_SMS_NUDGE_1','PLAYER_POOL_PROFILE_SMS_NUDGE_FINAL')
          AND status='QUEUED' AND "sentAt" IS NULL AND "providerMessageId" IS NULL FOR UPDATE
        `);
        for (const d of cancelled) {
          await db.notificationDispatch.update({ where: { id: d.id }, data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: "Recruitment fulfilled — already registered with a squad." } });
          await log("NOTIFICATION", d.id, "Unsent PlayerPool chase", d.status, "CANCELLED");
        }
      }
      if (current.profileId) {
        const requests = await db.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
          SELECT id, status FROM "PlayerPoolIntroductionRequest" WHERE "profileId"=${current.profileId}
          AND "teamId" IN (${Prisma.join(candidate.teams.map(t => t.id))}) AND status IN ('REQUESTED','INTRODUCED') FOR UPDATE
        `);
        for (const request of requests) {
          await db.$executeRaw`UPDATE "PlayerPoolIntroductionRequest" SET status='JOINED', "resolvedAt"=COALESCE("resolvedAt",NOW()), "updatedAt"=NOW() WHERE id=${request.id}`;
          await log("PLAYER_POOL_REQUEST", request.id, "Introduction to registered team", request.status, "JOINED");
          counts.requestsJoined++;
        }
      }
    }
    counts.changed = Object.entries(counts).some(([key,value]) => key !== 'changed' && Number(value) > 0);
    return counts;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function confirmRecruitmentIdentity(input: {
  kind: string; recordId: string; fingerprint: string; userId: string; actorUserId: string; reason: string;
}) {
  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { role: true } });
  if (actor?.role !== "ADMIN") throw new Error("Administrator access is required to confirm an identity match.");
  if (input.reason.trim().length < 10 || input.reason.length > 1000) throw new Error("Record how you verified this is the same person (10–1000 characters).");
  if (!["LEAD", "PROSPECT"].includes(input.kind)) throw new Error("Invalid recruitment record type.");
  const match = (await getPlayerRecruitmentMatches()).find(m => m.record.kind === input.kind && m.record.id === input.recordId);
  if (!match || match.fingerprint !== input.fingerprint) throw new Error("This record has changed or is already resolved. Refresh and review again.");
  const { ensurePlayerDataHealthRunTable } = await import("./player-data-health");
  await ensurePlayerDataHealthRunTable();
  const runId = randomUUID();
  await prisma.$executeRaw`INSERT INTO "PlayerDataHealthRun" (id,"runKey",source,status,"startedAt") VALUES (${runId},${'review:' + runId},'MANUAL_REVIEW','STARTED',NOW())`;
  try {
    const result = await reconcileRecruitmentMatch({ match, runId,
      confirmation: { userId: input.userId, actorUserId: input.actorUserId, reason: input.reason } });
    await prisma.$executeRaw`UPDATE "PlayerDataHealthRun" SET status='COMPLETED', "completedAt"=NOW(),
      "affectedUsers"=${result.changed ? 1 : 0}, "scannedUsers"=1, "prospectsActivated"=${result.prospectsActivated},
      "prospectsClosedAsDuplicate"=${result.prospectsClosedAsDuplicate}, "playerPoolProfilesJoined"=${result.playerPoolProfilesJoined},
      "requestsJoined"=${result.requestsJoined}, "leadsClosed"=${result.leadsClosed} WHERE id=${runId}`;
    return result;
  } catch (error) {
    await prisma.$executeRaw`UPDATE "PlayerDataHealthRun" SET status='FAILED', "completedAt"=NOW(), error=${error instanceof Error ? error.message : 'Review failed'} WHERE id=${runId}`;
    throw error;
  }
}
