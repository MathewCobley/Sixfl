import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Administrative suppression only: never change a captain response, fee or payment.
const INITIAL_ORIGIN = "night-board-last-minute-replacement";
export const REPLACEMENT_CONFIRMATION_REASON =
  "This team is the allocated last-minute replacement; another fixture confirmation is not required.";
export const FIXTURE_CONFIRMATION_REQUEST_SOURCES = [
  "FIXTURE_CONFIRMATION_INITIAL_EMAIL", "FIXTURE_CONFIRMATION_AUTO_EMAIL_72H",
  "FIXTURE_CONFIRMATION_AUTO_EMAIL_24H", "FIXTURE_CONFIRMATION_CHASE_SMS",
  "FIXTURE_CONFIRMATION_AUTO_SMS_72H", "FIXTURE_CONFIRMATION_AUTO_SMS_24H",
  "FIXTURE_CONFIRMATION_WARNING",
] as const;
const sources = new Set<string>(FIXTURE_CONFIRMATION_REQUEST_SOURCES);
type RawDb = Pick<Prisma.TransactionClient, "$queryRaw">;
type Reference = { fixtureId: string; teamId: string };
type Context = {
  homeTeamId: string; awayTeamId: string; leagueId: string; venueId: string | null;
  pitch: string | null; kickoffAt: Date; publishedAt: Date | null; status: string;
  updatedAt: Date;
  alertMetadata: unknown; alertCreatedAt: Date | null;
  replacementTeamId: string | null; resolvedOpponentTeamId: string | null; resolvedAt: Date | null;
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

/** A saved allocation must still match the exact advertised fixture. Merely
 * offering a slot, charging zero, or having helped on another fixture is not
 * agreement. Read pending allocation too: the edit hook and first queue drain
 * run before the separate replacement-reconciliation job. */
async function loadContext(input: Reference, db: RawDb): Promise<Context | null> {
  const rows = await db.$queryRaw<Context[]>(Prisma.sql`
    SELECT f."homeTeamId", f."awayTeamId", f."leagueId", f."venueId", f."pitch",
      f."kickoffAt", f."publishedAt", f."status"::text AS "status", f."updatedAt",
      alert."metadata" AS "alertMetadata", alert."createdAt" AS "alertCreatedAt",
      r."replacementTeamId", r."opponentTeamId" AS "resolvedOpponentTeamId", r."resolvedAt"
    FROM "Fixture" f
    LEFT JOIN LATERAL (
      SELECT d."metadata", d."createdAt" FROM "NotificationDispatch" d
      WHERE d."metadata"->>'origin' = ${INITIAL_ORIGIN}
        AND d."metadata"->>'fixtureId' = f."id"
        AND (d."status"::text IN ('QUEUED', 'PROCESSING', 'SENT')
          OR (d."status"::text = 'CANCELLED'
            AND d."failureReason" = 'Replacement request closed — unsent SMS cancelled.'
            AND d."metadata"->>'replacementSmsCancelledFrom' IN ('QUEUED', 'PROCESSING')))
      ORDER BY d."createdAt" DESC, d."id" DESC LIMIT 1
    ) alert ON TRUE
    LEFT JOIN LATERAL (
      SELECT resolution."replacementTeamId", resolution."opponentTeamId", resolution."resolvedAt"
      FROM "LastMinuteReplacementResolution" resolution
      WHERE resolution."fixtureId" = f."id"
        AND resolution."droppedTeamId" = alert."metadata"->>'droppedTeamId'
      ORDER BY resolution."resolvedAt" DESC, resolution."id" DESC LIMIT 1
    ) r ON TRUE
    WHERE f."id" = ${input.fixtureId}
  `);
  return rows[0] ?? null;
}

function matchesAllocatedReplacement(context: Context, teamId: string): boolean {
  const meta = record(context.alertMetadata);
  const dropped = text(meta.droppedTeamId), opponent = text(meta.opponentTeamId);
  const current = [context.homeTeamId, context.awayTeamId];
  if (!dropped || !opponent || dropped === opponent || !current.includes(teamId)
    || current.includes(dropped) || !current.includes(opponent) || teamId === opponent) return false;
  const advertisedKickoff = new Date(text(meta.kickoffAt));
  if (!Number.isFinite(advertisedKickoff.getTime()) || advertisedKickoff.getTime() !== context.kickoffAt.getTime()) return false;
  if (context.resolvedAt && (context.replacementTeamId !== teamId || context.resolvedOpponentTeamId !== opponent
    || (context.alertCreatedAt && context.alertCreatedAt > context.resolvedAt))) return false;
  const snapshot = record(meta.replacementContext);
  if (Object.keys(snapshot).length) {
    if (snapshot.leagueId !== context.leagueId || (snapshot.venueId ?? null) !== context.venueId
      || text(snapshot.pitch) !== text(context.pitch)) return false;
  } else if (context.resolvedAt && context.updatedAt > context.resolvedAt) {
    // Legacy alerts did not snapshot venue/pitch. A subsequent fixture edit
    // invalidates that legacy exemption rather than assuming renewed consent.
    return false;
  }
  return true;
}

export async function getAllocatedReplacementConfirmationBlock(input: Reference, db: RawDb = prisma, now = new Date()): Promise<string | null> {
  const context = await loadContext(input, db);
  if (!context || !context.publishedAt || context.status !== "SCHEDULED" || context.kickoffAt <= now) return null;
  return matchesAllocatedReplacement(context, input.teamId) ? REPLACEMENT_CONFIRMATION_REASON : null;
}

type Dispatch = { sourceType: string | null; sourceId: string | null; metadata: unknown };
function references(dispatch: Dispatch): Reference | null {
  const meta = record(dispatch.metadata);
  const [sourceFixtureId, sourceTeamId] = dispatch.sourceType === "FIXTURE_CONFIRMATION_WARNING"
    ? [] : (dispatch.sourceId ?? "").split(":");
  const fixtureId = text(meta.fixtureId) || sourceFixtureId, teamId = text(meta.teamId) || sourceTeamId;
  return fixtureId && teamId ? { fixtureId, teamId } : null;
}

/** Called by the owning worker immediately before either provider submission.
 * Payment reminders, replacement-details messages and player availability are
 * not ordinary team-confirmation requests and must remain untouched. */
export async function getFixtureConfirmationDeliveryBlock(dispatch: Dispatch, db: RawDb = prisma, now = new Date()): Promise<string | null> {
  if (!dispatch.sourceType || !sources.has(dispatch.sourceType)) return null;
  const refs = references(dispatch);
  if (!refs) return "Fixture confirmation is missing its fixture/team references.";
  const context = await loadContext(refs, db);
  if (!context || !context.publishedAt || context.status !== "SCHEDULED" || context.kickoffAt <= now)
    return "Fixture is no longer available for team confirmation.";
  if (![context.homeTeamId, context.awayTeamId].includes(refs.teamId)) return "Team is no longer in this fixture.";
  if (matchesAllocatedReplacement(context, refs.teamId)) return REPLACEMENT_CONFIRMATION_REASON;
  return null;
}

/** Remove unsent obsolete chases when the existing resolution flow runs. Never
 * sweep PROCESSING (a provider request may be in flight), SENT or accepted rows.
 * The final provider gate protects rows already claimed by another worker. */
export async function cancelAllocatedReplacementConfirmationRequests(fixtureId: string) {
  const candidates = await prisma.notificationDispatch.findMany({
    where: { sourceType: { in: [...FIXTURE_CONFIRMATION_REQUEST_SOURCES] },
      status: { in: ["QUEUED", "FAILED"] }, sentAt: null, providerMessageId: null,
      OR: [{ metadata: { path: ["fixtureId"], equals: fixtureId } }, { sourceId: { startsWith: `${fixtureId}:` } }],
      attempts: { none: { status: "SUCCESS" } },
      messageEntries: { none: { OR: [{ sentAt: { not: null } }, { providerMessageId: { not: null } }, { twilioMessageSid: { not: null } }] } },
    }, select: { id: true, sourceId: true, sourceType: true, metadata: true },
  });
  let cancelled = 0;
  for (const dispatch of candidates) {
    const refs = references(dispatch);
    if (!refs || refs.fixtureId !== fixtureId || !await getAllocatedReplacementConfirmationBlock(refs)) continue;
    const updated = await prisma.notificationDispatch.updateMany({ where: { id: dispatch.id,
      status: { in: ["QUEUED", "FAILED"] }, sentAt: null, providerMessageId: null,
      attempts: { none: { status: "SUCCESS" } },
      messageEntries: { none: { OR: [{ sentAt: { not: null } }, { providerMessageId: { not: null } }, { twilioMessageSid: { not: null } }] } },
    }, data: { status: "CANCELLED", cancelledAt: new Date(), failureReason: REPLACEMENT_CONFIRMATION_REASON } });
    if (updated.count) {
      cancelled += updated.count;
      await prisma.messageEntry.updateMany({ where: { notificationDispatchId: dispatch.id,
        sentAt: null, providerMessageId: null, twilioMessageSid: null },
        data: { providerStatus: `CANCELLED: ${REPLACEMENT_CONFIRMATION_REASON}` } });
    }
  }
  return cancelled;
}
