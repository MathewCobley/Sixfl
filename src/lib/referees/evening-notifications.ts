import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/notifications/phone";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { renderNotificationText } from "@/lib/notifications/renderer";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import {
  ARRIVAL_LEAD, EVENING_SOURCE, HOUR, URGENT_WINDOW,
  eveningSnapshot, eveningIsOver, lastCommunicated, planEveningNotice,
  type EveningFixture, type EveningHistory, type EveningMessageKind, type EveningSnapshot,
} from "./evening-policy";

// Both the extended root client and its interactive transaction share these delegates.
type Db = Pick<typeof prisma,
  "$queryRaw" | "$executeRaw" | "notificationDispatch" | "notificationTemplate"
  | "notificationRecipient" | "notificationPreference">;
type ConfirmationStatus = "PENDING" | "CONFIRMED" | "DECLINED";
type EveningRow = {
  id: string; refereeId: string; nightDate: string; changedAt: Date; generation: number;
  summaryHash: string | null; confirmationStatus: ConfirmationStatus; respondedAt: Date | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function storedSnapshot(value: unknown): EveningSnapshot | null {
  const v = record(value);
  return typeof v.hash === "string" && Array.isArray(v.segments) ? v as unknown as EveningSnapshot : null;
}
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function formatEveningTime(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "TBC";
}
export function formatEveningDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));
}

export async function readEveningSnapshot(row: Pick<EveningRow, "refereeId" | "nightDate">, db: Db = prisma) {
  const fixtures = await db.$queryRaw<EveningFixture[]>(Prisma.sql`
    SELECT f.id, f."venueId", v.name AS "venueName",
      NULLIF(CONCAT_WS(', ', NULLIF(v.address, ''), NULLIF(v.postcode, '')), '') AS "venueAddress",
      f."kickoffAt", l."minutesPerGame"::int AS "minutesPerGame"
    FROM "Fixture" f JOIN "League" l ON l.id = f."leagueId"
    LEFT JOIN "Venue" v ON v.id = f."venueId"
    WHERE f."refereeId" = ${row.refereeId} AND f."publishedAt" IS NOT NULL
      AND f.status IN ('SCHEDULED', 'COMPLETED')
      AND (f."kickoffAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date = ${row.nightDate}::date
      AND NOT EXISTS (
        SELECT 1 FROM "RefereeNightFixture" rnf JOIN "RefereeNight" rn ON rn.id = rnf."refereeNightId"
        WHERE rnf."fixtureId" = f.id AND rn."refereeId" = f."refereeId" AND rn.status = 'CANCELLED'
      )
    ORDER BY f."kickoffAt", f.id
  `);
  return eveningSnapshot(fixtures);
}

async function syncConfirmation(row: EveningRow, db: Db) {
  // Cashup identities stay separate, but one attendance answer covers the evening.
  await db.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight" SET
      "confirmationStatus" = ${row.confirmationStatus},
      "confirmationConfirmedAt" = CASE WHEN ${row.confirmationStatus} = 'CONFIRMED' THEN ${row.respondedAt} ELSE NULL END,
      "confirmationDeclinedAt" = CASE WHEN ${row.confirmationStatus} = 'DECLINED' THEN ${row.respondedAt} ELSE NULL END,
      "confirmationResponseNote" = 'Attendance managed by the consolidated referee evening booking.',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "refereeId" = ${row.refereeId} AND "nightDate" = ${row.nightDate}::date
      AND status NOT IN ('CANCELLED', 'SETTLED')
      AND "confirmationStatus" IS DISTINCT FROM ${row.confirmationStatus}
  `);
}

async function observeSnapshot(row: EveningRow, snapshot: EveningSnapshot, db: Db) {
  if (row.summaryHash === snapshot.hash) return;
  if (row.summaryHash === null) {
    // Preserve existing answers on initial rollout rather than reconfirming all refs.
    const previous = await db.$queryRaw<Array<{ status: string; respondedAt: Date | null }>>(Prisma.sql`
      SELECT "confirmationStatus" AS status,
        GREATEST("confirmationConfirmedAt", "confirmationDeclinedAt") AS "respondedAt"
      FROM "RefereeNight" WHERE "refereeId" = ${row.refereeId} AND "nightDate" = ${row.nightDate}::date
        AND status NOT IN ('CANCELLED', 'SETTLED')
    `);
    row.confirmationStatus = previous.some((p) => p.status === "DECLINED") ? "DECLINED"
      : previous.length && previous.every((p) => p.status === "CONFIRMED") ? "CONFIRMED" : "PENDING";
    row.respondedAt = previous.map((p) => p.respondedAt).filter((d): d is Date => d !== null).sort((a,b) => b.getTime()-a.getTime())[0] ?? null;
  } else {
    row.confirmationStatus = "PENDING";
    row.respondedAt = null;
    // Old delivered links must not confirm a newly changed work window.
    await db.$executeRaw(Prisma.sql`
      UPDATE "RefereeNight" SET "confirmationTokenHash" = NULL
      WHERE "refereeId" = ${row.refereeId} AND "nightDate" = ${row.nightDate}::date
    `);
  }
  row.summaryHash = snapshot.hash;
  await db.$executeRaw(Prisma.sql`
    UPDATE "RefereeEveningNotice" SET "summaryHash" = ${snapshot.hash},
      "confirmationStatus" = ${row.confirmationStatus}, "respondedAt" = ${row.respondedAt}
    WHERE id = ${row.id}
  `);
}

async function eveningRecipient(row: EveningRow, db: Db) {
  const users = await db.$queryRaw<Array<{ name: string | null; email: string | null; phone: string | null; isActive: boolean }>>(Prisma.sql`
    SELECT u.name, u.email, COALESCE(NULLIF(rp.phone, ''), lead.phone) AS phone,
      COALESCE(rp."isActive", TRUE) AS "isActive"
    FROM "User" u LEFT JOIN "RefereeProfile" rp ON rp."userId" = u.id
    LEFT JOIN "InterestLead" lead ON lead.id = u."createdFromLeadId"
    WHERE u.id = ${row.refereeId}
  `);
  const user = users[0];
  if (!user || !user.isActive) return null;
  const email = user.email?.trim().toLowerCase() || null;
  const phone = normalizePhoneNumber(user.phone);
  const recipient = await db.notificationRecipient.upsert({
    where: { sourceType_sourceId: { sourceType: "REFEREE", sourceId: row.refereeId } },
    // Never overwrite an existing suppression, consent or channel preference.
    update: { displayName: user.name, email, emailNormalized: email, phone, phoneNormalized: phone },
    create: { sourceType: "REFEREE", sourceId: row.refereeId, audience: "REFEREE",
      displayName: user.name, email, emailNormalized: email, phone, phoneNormalized: phone,
      transactionalEmailOptIn: true, transactionalSmsOptIn: true,
      metadata: { userId: row.refereeId, entityType: "REFEREE" } },
  });
  await db.notificationPreference.upsert({ where: { recipientId: recipient.id }, update: {}, create: { recipientId: recipient.id } });
  return recipient;
}

async function renderSchedule(snapshot: EveningSnapshot, channel: "EMAIL" | "SMS", db: Db) {
  const template = await db.notificationTemplate.findUnique({ where: { key: `referee-evening-schedule-${channel.toLowerCase()}` } });
  if (!template?.isActive) throw new Error("The referee evening schedule template is missing or inactive.");
  return snapshot.segments.map((segment) => renderNotificationText(template.body, {
    venueName: segment.venueName || "Venue TBC", venueAddress: segment.venueAddress || "",
    arriveAt: formatEveningTime(new Date(Date.parse(segment.first) - ARRIVAL_LEAD).toISOString()),
    firstKickoff: formatEveningTime(segment.first), lastKickoff: formatEveningTime(segment.last), finishAt: formatEveningTime(segment.finish),
  })).join(channel === "EMAIL" ? "\n\n" : " ");
}

async function historyFor(row: EveningRow, db: Db): Promise<EveningHistory[]> {
  const dispatches = await db.notificationDispatch.findMany({
    where: { sourceType: EVENING_SOURCE, sourceId: row.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return dispatches.flatMap((d) => {
    const m = record(d.metadata); const snapshot = storedSnapshot(m.snapshot);
    if (!snapshot) return [];
    return [{ id: d.id, kind: m.messageKind as EveningMessageKind, channel: d.channel,
      status: d.status, hash: snapshot.hash, snapshot, createdAt: d.createdAt, sentAt: d.sentAt }];
  });
}

export async function processRefereeEvening(eveningId: string, now = new Date()) {
  return prisma.$transaction(async (db) => {
    const rows = await db.$queryRaw<EveningRow[]>(Prisma.sql`
      SELECT *, "nightDate"::text AS "nightDate" FROM "RefereeEveningNotice"
      WHERE id = ${eveningId} FOR UPDATE SKIP LOCKED
    `);
    const row = rows[0];
    if (!row) return { queued: 0, skipped: 0 };
    const snapshot = await readEveningSnapshot(row, db);
    await observeSnapshot(row, snapshot, db);
    await syncConfirmation(row, db);
    // A queued message may have been deferred for quiet hours, or by an outage.
    // Cancel it before selecting a new plan if anything it promises is stale.
    const pending = await db.notificationDispatch.findMany({
      where: { sourceType: EVENING_SOURCE, sourceId: row.id, status: "QUEUED" },
    });
    for (const dispatch of pending) {
      const m = record(dispatch.metadata);
      const wrongAnswer = m.messageKind !== "cancelled" && m.confirmationStatus !== row.confirmationStatus;
      if (m.summaryHash !== snapshot.hash || m.generation !== row.generation || wrongAnswer) {
        await db.notificationDispatch.updateMany({ where: { id: dispatch.id, status: "QUEUED" },
          data: { status: "CANCELLED", cancelledAt: now, failureReason: "Evening changed before delivery; replaced with the latest settled booking." } });
      }
    }
    const history = await historyFor(row, db);
    const plan = planEveningNotice({ now, changedAt: row.changedAt, snapshot, history, declined: row.confirmationStatus === "DECLINED" });
    if (!plan) return { queued: 0, skipped: 0 };
    const recipient = await eveningRecipient(row, db);
    if (!recipient) return { queued: 0, skipped: 1 };
    const token = randomBytes(32).toString("base64url");
    const base = getPublicSiteUrl().replace(/\/+$/, "");
    const confirmationUrl = `${base}/referee-evening-confirm/${token}`;
    const previous = lastCommunicated(history)?.snapshot ?? snapshot;
    const window = snapshot.first ? snapshot : previous;
    const key = plan.kind === "booking" && row.confirmationStatus === "CONFIRMED" ? "booking-confirmed"
      : plan.kind === "reminder" && row.confirmationStatus !== "CONFIRMED" ? "confirmation" : plan.kind;
    const dispatch = await queueNotificationFromTemplate({
      templateKey: `referee-evening-${key}-${plan.channel.toLowerCase()}`,
      recipientId: recipient.id,
      sourceType: EVENING_SOURCE, sourceId: row.id, scheduledFor: now, urgent: plan.urgent,
      variables: {
        firstName: recipient.displayName?.trim().split(/\s+/)[0] || "there",
        nightLabel: formatEveningDate(row.nightDate),
        schedule: await renderSchedule(snapshot, plan.channel, db),
        previousSchedule: await renderSchedule(previous, plan.channel, db),
        confirmationUrl, dashboardUrl: `${base}/referee`,
      },
      metadata: { refereeId: row.refereeId, eveningId: row.id, nightDate: row.nightDate,
        messageKind: plan.kind, summaryHash: snapshot.hash, generation: row.generation,
        confirmationStatus: row.confirmationStatus, urgent: plan.urgent,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        workWindow: window as unknown as Prisma.InputJsonValue },
    }, db);
    if (dispatch.status === "QUEUED" && plan.kind !== "cancelled") {
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeEveningToken" (hash, "eveningId", "summaryHash", "expiresAt")
        VALUES (${hashToken(token)}, ${row.id}, ${snapshot.hash},
          ${new Date(Date.parse(snapshot.finish ?? snapshot.last!) + 3 * HOUR)})
      `);
      await db.$executeRaw(Prisma.sql`
        UPDATE "RefereeNight" SET "confirmationSentAt" = COALESCE("confirmationSentAt", ${now}),
          "confirmationLastChasedAt" = ${now}
        WHERE "refereeId" = ${row.refereeId} AND "nightDate" = ${row.nightDate}::date AND status <> 'CANCELLED'
      `);
    }
    return { queued: dispatch.status === "QUEUED" ? 1 : 0, skipped: dispatch.status === "SKIPPED" ? 1 : 0 };
  }, { maxWait: 5000, timeout: 20000 });
}

export async function runRefereeEveningNotifications(input?: { now?: Date }) {
  const now = input?.now ?? new Date();
  const result = { scanned: 0, queued: 0, skipped: 0 };
  const errors: string[] = [];
  let cursor = "";
  // Keyset pagination: large fixture batches cannot starve later referees.
  for (;;) {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM "RefereeEveningNotice"
      WHERE "nightDate" >= (${now}::timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/London')::date
        AND id > ${cursor} ORDER BY id LIMIT 100
    `);
    if (!rows.length) break;
    for (const row of rows) {
      result.scanned++;
      try { const outcome = await processRefereeEvening(row.id, now); result.queued += outcome.queued; result.skipped += outcome.skipped; }
      catch (error) { errors.push(`${row.id}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    cursor = rows[rows.length - 1].id;
  }
  if (errors.length) throw new Error(`Referee evenings: ${result.queued} queued; ${errors.length} need attention. ${errors.join("; ")}`);
  return result;
}

/** Compatibility entry point for night creation/backfill/manual check. Fixture
 * triggers own changedAt; calling this repeatedly must never restart the clock. */
export async function scheduleRefereeEveningForNight(input: { refereeNightId: string; createdByUserId?: string | null }) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "RefereeEveningNotice" (id, "refereeId", "nightDate")
    SELECT md5("refereeId" || ':' || "nightDate"::text), "refereeId", "nightDate"
    FROM "RefereeNight" WHERE id = ${input.refereeNightId}
      AND "nightDate" >= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/London')::date
    ON CONFLICT ("refereeId", "nightDate") DO NOTHING
  `);
  return { queued: 0, skipped: 0, status: "scheduled" as const };
}

/** Called immediately before claiming a queued dispatch. Independent of cron
 * ordering, so an old queue cannot escape through a manual Process Queue action. */
export async function refereeEveningDeliveryBlock(input: {
  sourceType: string | null; sourceId: string | null; metadata: unknown;
}, now = new Date()) {
  if (input.sourceType !== EVENING_SOURCE) return null;
  const m = record(input.metadata);
  const rows = await prisma.$queryRaw<EveningRow[]>(Prisma.sql`
    SELECT *, "nightDate"::text AS "nightDate" FROM "RefereeEveningNotice" WHERE id = ${input.sourceId}
  `);
  const row = rows[0];
  if (!row) return "Referee evening no longer exists.";
  const snapshot = await readEveningSnapshot(row);
  if (m.summaryHash !== snapshot.hash || m.generation !== row.generation) return "Referee evening changed before delivery.";
  if (m.messageKind !== "cancelled" && m.confirmationStatus !== row.confirmationStatus) return "Referee attendance response changed before delivery.";
  const window = snapshot.first ? snapshot : storedSnapshot(m.workWindow);
  if (!window || eveningIsOver(window, now)) return "Referee evening has already ended.";
  if (Date.parse(window.first!) - now.getTime() > URGENT_WINDOW && now.getTime() < row.changedAt.getTime() + HOUR) return "Referee assignments are still settling.";
  if (m.messageKind === "reminder" && (row.confirmationStatus === "DECLINED" || now.getTime() >= Date.parse(window.first!))) return "Referee reminder is no longer relevant before arrival.";
  return null;
}

export async function getEveningConfirmation(token: string, db: Db = prisma) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await db.$queryRaw<Array<EveningRow & { tokenSummaryHash: string; expiresAt: Date; consumedAt: Date | null }>>(Prisma.sql`
    SELECT e.*, e."nightDate"::text AS "nightDate", t."summaryHash" AS "tokenSummaryHash", t."expiresAt", t."consumedAt"
    FROM "RefereeEveningToken" t JOIN "RefereeEveningNotice" e ON e.id = t."eveningId"
    WHERE t.hash = ${hashToken(token)} AND t."expiresAt" > CURRENT_TIMESTAMP
  `);
  const row = rows[0];
  if (!row) return null;
  const snapshot = await readEveningSnapshot(row, db);
  if (!snapshot.first || snapshot.hash !== row.tokenSummaryHash || eveningIsOver(snapshot, new Date())) return null;
  return { row, snapshot };
}

export async function respondToEveningToken(token: string, answer: "yes" | "no") {
  return prisma.$transaction(async (db) => {
    const tokenRows = await db.$queryRaw<Array<{ eveningId: string }>>(Prisma.sql`SELECT "eveningId" FROM "RefereeEveningToken" WHERE hash = ${hashToken(token)}`);
    if (!tokenRows[0]) return false;
    await db.$queryRaw(Prisma.sql`SELECT id FROM "RefereeEveningNotice" WHERE id = ${tokenRows[0].eveningId} FOR UPDATE`);
    const context = await getEveningConfirmation(token, db);
    if (!context || context.row.consumedAt) return false;
    await saveEveningAnswer(context.row, context.snapshot.hash, answer, db);
    return true;
  });
}

async function saveEveningAnswer(row: EveningRow, summaryHash: string, answer: "yes" | "no", db: Db) {
  row.confirmationStatus = answer === "yes" ? "CONFIRMED" : "DECLINED";
  row.respondedAt = new Date();
  await db.$executeRaw(Prisma.sql`
    UPDATE "RefereeEveningNotice" SET "confirmationStatus" = ${row.confirmationStatus},
      "respondedAt" = ${row.respondedAt}, "summaryHash" = ${summaryHash} WHERE id = ${row.id}
  `);
  await db.$executeRaw(Prisma.sql`
    UPDATE "RefereeEveningToken" SET "consumedAt" = ${row.respondedAt}
    WHERE "eveningId" = ${row.id} AND "consumedAt" IS NULL
  `);
  await syncConfirmation(row, db);
}

/** Authenticated dashboard and already-issued legacy links join the same evening
 * state. Ownership is checked by the dashboard caller before invoking this. */
export async function recordEveningAnswerForNight(refereeNightId: string, answer: "yes" | "no", refereeId?: string) {
  if (refereeId) {
    const owned = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "RefereeNight" WHERE id = ${refereeNightId} AND "refereeId" = ${refereeId}`);
    if (!owned.length) return false;
  }
  await scheduleRefereeEveningForNight({ refereeNightId });
  return prisma.$transaction(async (db) => {
    const rows = await db.$queryRaw<EveningRow[]>(Prisma.sql`
      SELECT e.*, e."nightDate"::text AS "nightDate" FROM "RefereeEveningNotice" e
      JOIN "RefereeNight" rn ON rn."refereeId" = e."refereeId" AND rn."nightDate" = e."nightDate"
      WHERE rn.id = ${refereeNightId} AND rn.status NOT IN ('CANCELLED', 'SETTLED')
        ${refereeId ? Prisma.sql`AND e."refereeId" = ${refereeId}` : Prisma.empty}
      FOR UPDATE OF e
    `);
    const row = rows[0];
    if (!row) return false;
    const snapshot = await readEveningSnapshot(row, db);
    if (!snapshot.first || eveningIsOver(snapshot, new Date())) return false;
    await saveEveningAnswer(row, snapshot.hash, answer, db);
    return true;
  });
}
