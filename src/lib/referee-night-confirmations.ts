// ========================================
// File: src/lib/referee-night-confirmations.ts
// ========================================

import { createHash, randomUUID } from "crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueDirectNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { formatKickoffTime, formatMoney, formatNightDate, getRefereeNightById, getRefereeNightFixtures } from "@/lib/referee-nights";
import { getRefereeProfileByUserId } from "@/lib/referees/profile";
import { getPublicSiteUrl } from "@/lib/stripe/client";

export type RefereeNightConfirmationStatus = "PENDING" | "CONFIRMED" | "DECLINED";
export type RefereeNightConfirmationChaseMode = "manual" | "auto72h" | "auto24h";

type RefereeNightConfirmationRow = {
  id: string;
  refereeId: string;
  confirmationStatus: string | null;
};

type RefereeNightDueRow = {
  refereeNightId: string;
  firstKickoffAt: Date;
};

let ensuredConfirmationColumns = false;

export function getRefereeNightConfirmationTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function ensureRefereeNightConfirmationColumns() {
  if (ensuredConfirmationColumns) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "RefereeNight"
      ADD COLUMN IF NOT EXISTS "confirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS "confirmationTokenHash" TEXT,
      ADD COLUMN IF NOT EXISTS "confirmationSentAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationLastChasedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationConfirmedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationDeclinedAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "confirmationResponseNote" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "RefereeNight_confirmationTokenHash_key"
      ON "RefereeNight" ("confirmationTokenHash")
      WHERE "confirmationTokenHash" IS NOT NULL;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "RefereeNight_confirmationStatus_nightDate_idx"
      ON "RefereeNight" ("confirmationStatus", "nightDate");
  `);

  ensuredConfirmationColumns = true;
}

function siteUrl() {
  return getPublicSiteUrl().replace(/\/+$/, "");
}

function confirmationUrl(answer: "yes" | "no", token: string) {
  return `${siteUrl()}/referee-confirm/${answer}?token=${encodeURIComponent(token)}`;
}

function formatFirstName(value?: string | null) {
  return (value?.trim() || "there").split(/\s+/)[0] || "there";
}

function formatFixtureLine(fixture: Awaited<ReturnType<typeof getRefereeNightFixtures>>[number]) {
  const pitch = fixture.pitch?.trim() ? ` · ${fixture.pitch.trim()}` : "";
  return `${formatKickoffTime(fixture.kickoffAt)} - ${fixture.homeTeam.name} v ${fixture.awayTeam.name}${pitch}`;
}

async function getRefereeNightConfirmationRow(refereeNightId: string) {
  await ensureRefereeNightConfirmationColumns();

  const rows = await prisma.$queryRaw<RefereeNightConfirmationRow[]>(Prisma.sql`
    SELECT id, "refereeId", "confirmationStatus"
    FROM "RefereeNight"
    WHERE id = ${refereeNightId}
    LIMIT 1
  `);

  return rows[0] ?? null;
}

async function hasChaseDispatch(input: { refereeNightId: string; mode: RefereeNightConfirmationChaseMode }) {
  if (input.mode === "manual") return false;

  return prisma.notificationDispatch.findFirst({
    where: {
      sourceType: `REFEREE_NIGHT_CONFIRMATION_${input.mode.toUpperCase()}`,
      sourceId: input.refereeNightId,
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
          NotificationDispatchStatus.SKIPPED,
        ],
      },
    },
    select: { id: true },
  });
}

async function getRefereeRecipient(refereeId: string) {
  const [referee, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: refereeId },
      select: { id: true, name: true, email: true },
    }),
    getRefereeProfileByUserId(refereeId),
  ]);

  if (!referee) return null;

  return upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.REFEREE,
    sourceId: referee.id,
    audience: NotificationAudience.REFEREE,
    displayName: referee.name || referee.email,
    email: referee.email,
    phone: profile?.phone ?? null,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      userId: referee.id,
      entityType: "REFEREE",
    },
  });
}

export async function queueRefereeNightConfirmationChase(input: {
  refereeNightId: string;
  mode?: RefereeNightConfirmationChaseMode;
  createdByUserId?: string | null;
}) {
  const mode = input.mode ?? "manual";
  await ensureRefereeNightConfirmationColumns();

  const [night, fixtures] = await Promise.all([
    getRefereeNightById(input.refereeNightId),
    getRefereeNightFixtures(input.refereeNightId),
  ]);

  if (!night) return { queued: 0, skipped: 1, status: "missing_night" as const };
  if (night.status === "CANCELLED" || night.status === "SETTLED") return { queued: 0, skipped: 1, status: "closed_night" as const };

  const confirmationRow = await getRefereeNightConfirmationRow(night.id);
  if (confirmationRow?.confirmationStatus === "CONFIRMED") return { queued: 0, skipped: 1, status: "already_confirmed" as const };
  if (confirmationRow?.confirmationStatus === "DECLINED") return { queued: 0, skipped: 1, status: "already_declined" as const };

  const existing = await hasChaseDispatch({ refereeNightId: night.id, mode });
  if (existing) return { queued: 0, skipped: 0, status: "already_sent" as const };

  const recipient = await getRefereeRecipient(night.refereeId);
  if (!recipient?.email && !recipient?.phone) return { queued: 0, skipped: 1, status: "missing_contact" as const };

  const token = randomUUID();
  const tokenHash = getRefereeNightConfirmationTokenHash(token);
  const yesUrl = confirmationUrl("yes", token);
  const noUrl = confirmationUrl("no", token);
  const fixturesList = fixtures.length ? fixtures.map(formatFixtureLine).join("\n") : "Fixtures are not assigned yet.";
  const firstName = formatFirstName(recipient.displayName || recipient.email);
  const sourceType = `REFEREE_NIGHT_CONFIRMATION_${mode.toUpperCase()}`;
  const subject = `Please confirm your SIXFL referee night: ${formatNightDate(night.nightDate)}`;
  const body = [
    `Hi ${firstName},`,
    "",
    `Please confirm you can referee for SIXFL on ${formatNightDate(night.nightDate)} at ${night.venueName || "venue TBC"}.`,
    "",
    `League: ${night.leagueName}${night.leagueSeason ? ` · ${night.leagueSeason}` : ""}`,
    `Night fee: ${formatMoney(night.feePence)}`,
    "",
    "Fixtures:",
    fixturesList,
    "",
    `YES - I can ref: ${yesUrl}`,
    `NO - I can't make it: ${noUrl}`,
    "",
    "Please tap one of the links so we know the night is covered.",
  ].join("\n");

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "RefereeNight"
    SET
      "confirmationStatus" = 'PENDING',
      "confirmationTokenHash" = ${tokenHash},
      "confirmationSentAt" = COALESCE("confirmationSentAt", NOW()),
      "confirmationLastChasedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE id = ${night.id}
  `);

  let queued = 0;
  let skipped = 0;
  const channels: NotificationChannel[] = recipient.phone ? [NotificationChannel.SMS] : [];
  if (recipient.email) channels.push(NotificationChannel.EMAIL);

  for (const channel of channels) {
    const dispatch = await queueDirectNotification({
      recipientId: recipient.id,
      channel,
      audience: NotificationAudience.REFEREE,
      subject: channel === NotificationChannel.EMAIL ? subject : null,
      body,
      isTransactional: true,
      sourceType,
      sourceId: night.id,
      metadata: {
        origin: "referee_night_confirmation_chase",
        mode,
        refereeNightId: night.id,
        refereeId: night.refereeId,
      },
      createdByUserId: input.createdByUserId,
    });

    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
    if (dispatch.status === NotificationDispatchStatus.SKIPPED) skipped += 1;
  }

  return { queued, skipped, status: queued > 0 ? "queued" as const : "skipped" as const };
}

export async function queueDueRefereeNightConfirmationChasers(input?: { now?: Date }) {
  await ensureRefereeNightConfirmationColumns();
  const now = input?.now ?? new Date();
  const windows = [
    { mode: "auto72h" as const, start: new Date(now.getTime() + 71.5 * 60 * 60 * 1000), end: new Date(now.getTime() + 72.5 * 60 * 60 * 1000) },
    { mode: "auto24h" as const, start: new Date(now.getTime() + 23.5 * 60 * 60 * 1000), end: new Date(now.getTime() + 24.5 * 60 * 60 * 1000) },
  ];

  const minStart = windows.reduce((min, window) => window.start < min ? window.start : min, windows[0].start);
  const maxEnd = windows.reduce((max, window) => window.end > max ? window.end : max, windows[0].end);

  const rows = await prisma.$queryRaw<RefereeNightDueRow[]>(Prisma.sql`
    SELECT
      rn.id AS "refereeNightId",
      MIN(f."kickoffAt") AS "firstKickoffAt"
    FROM "RefereeNight" rn
    JOIN "RefereeNightFixture" rnf ON rnf."refereeNightId" = rn.id
    JOIN "Fixture" f ON f.id = rnf."fixtureId"
    WHERE rn.status NOT IN ('CANCELLED', 'SETTLED')
      AND COALESCE(rn."confirmationStatus", 'PENDING') NOT IN ('CONFIRMED', 'DECLINED')
      AND f.status <> 'CANCELLED'
    GROUP BY rn.id
    HAVING MIN(f."kickoffAt") >= ${minStart} AND MIN(f."kickoffAt") <= ${maxEnd}
    ORDER BY MIN(f."kickoffAt") ASC
    LIMIT 100
  `);

  const summary = { scanned: rows.length, queued: 0, skipped: 0, alreadySent: 0 };
  for (const row of rows) {
    const window = windows.find((item) => row.firstKickoffAt >= item.start && row.firstKickoffAt <= item.end);
    if (!window) continue;
    const result = await queueRefereeNightConfirmationChase({ refereeNightId: row.refereeNightId, mode: window.mode });
    summary.queued += result.queued;
    summary.skipped += result.skipped;
    if (result.status === "already_sent") summary.alreadySent += 1;
  }

  return summary;
}

export async function recordRefereeNightConfirmation(input: {
  token: string;
  answer: "yes" | "no";
}) {
  await ensureRefereeNightConfirmationColumns();
  const tokenHash = getRefereeNightConfirmationTokenHash(input.token);
  const status: RefereeNightConfirmationStatus = input.answer === "yes" ? "CONFIRMED" : "DECLINED";
  const now = new Date();

  const rows = await prisma.$queryRaw<Array<{ id: string; refereeId: string; nightDate: Date | string; leagueName: string; refereeName: string | null; refereeEmail: string | null }>>(Prisma.sql`
    UPDATE "RefereeNight" rn
    SET
      "confirmationStatus" = ${status},
      "confirmationConfirmedAt" = CASE WHEN ${status} = 'CONFIRMED' THEN ${now} ELSE "confirmationConfirmedAt" END,
      "confirmationDeclinedAt" = CASE WHEN ${status} = 'DECLINED' THEN ${now} ELSE "confirmationDeclinedAt" END,
      "confirmationResponseNote" = ${status === "CONFIRMED" ? "Referee confirmed they can attend." : "Referee said they cannot attend."},
      "confirmationTokenHash" = NULL,
      "updatedAt" = NOW()
    FROM "League" l
    JOIN "User" u ON u.id = rn."refereeId"
    WHERE rn."confirmationTokenHash" = ${tokenHash}
      AND l.id = rn."leagueId"
    RETURNING rn.id, rn."refereeId", rn."nightDate", l.name AS "leagueName", u.name AS "refereeName", u.email AS "refereeEmail"
  `);

  return rows[0] ?? null;
}
