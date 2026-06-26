// ========================================
// File: src/lib/referee-availability.ts
// ========================================

import { randomUUID } from "crypto";
import {
  NotificationAudience,
  NotificationChannel,
  NotificationRecipientSourceType,
  Prisma,
  UserRole,
  type PreferredNight,
} from "@prisma/client";

import { queueDirectNotification } from "@/lib/notifications/service";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { processNotificationQueue } from "@/lib/notifications/processor";
import { prisma } from "@/lib/prisma";

export type RefereeAvailabilityStatus =
  | "AVAILABLE"
  | "MAYBE"
  | "UNAVAILABLE"
  | "NO_RESPONSE";

export type RefereeAvailabilityLeague = {
  id: string;
  name: string;
  season: string | null;
  dayOfWeek: PreferredNight;
  venueName: string | null;
};

export type RefereeAvailabilitySlot = {
  id: string | null;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  venueName: string | null;
  dayOfWeek: PreferredNight;
  date: string;
  status: RefereeAvailabilityStatus;
  note: string | null;
  respondedAt: Date | null;
};

export type RefereeAvailabilityMonth = {
  monthKey: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  leagues: RefereeAvailabilityLeague[];
  slots: RefereeAvailabilitySlot[];
};

type RawAvailabilityRow = {
  id: string | null;
  leagueId: string;
  leagueName: string;
  leagueSeason: string | null;
  venueName: string | null;
  dayOfWeek: PreferredNight;
  availabilityDate: string | Date;
  status: RefereeAvailabilityStatus | null;
  note: string | null;
  respondedAt: Date | null;
};

type RawAdminAvailabilityRow = RawAvailabilityRow & {
  refereeId: string;
  refereeName: string | null;
  refereeEmail: string | null;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function formatAvailabilityDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(`${value}T12:00:00.000Z`);
  return DATE_FORMATTER.format(date);
}

export function getDefaultAvailabilityMonthKey(now = new Date()) {
  return getNextMonthKey(now);
}

export function getNextMonthKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const next = new Date(Date.UTC(year, month + 1, 1, 12, 0, 0));
  return toMonthKey(next);
}

export function toMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normaliseMonthKey(value?: string | null) {
  const candidate = value?.trim();
  if (candidate && /^\d{4}-\d{2}$/.test(candidate)) {
    const [, monthText] = candidate.split("-");
    const month = Number(monthText);
    if (month >= 1 && month <= 12) return candidate;
  }

  return getDefaultAvailabilityMonthKey();
}

export function getMonthBounds(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 12, 0, 0));

  return {
    monthKey,
    monthLabel: MONTH_FORMATTER.format(start),
    start,
    end,
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

export function getAdjacentMonthKey(monthKey: string, offset: number) {
  const [yearText, monthText] = monthKey.split("-");
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + offset, 1, 12, 0, 0));
  return toMonthKey(date);
}

function toDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function preferredNightToUtcDay(day: PreferredNight) {
  switch (day) {
    case "SUNDAY":
      return 0;
    case "MONDAY":
      return 1;
    case "TUESDAY":
      return 2;
    case "WEDNESDAY":
      return 3;
    case "THURSDAY":
      return 4;
    case "FRIDAY":
      return 5;
    case "SATURDAY":
      return 6;
    default:
      return null;
  }
}

export async function getActiveRefereeAvailabilityLeagues() {
  return prisma.league.findMany({
    where: {
      isActive: true,
      dayOfWeek: {
        not: null,
      },
      NOT: {
        dayOfWeek: "ANY",
      },
    },
    orderBy: [{ dayOfWeek: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      season: true,
      dayOfWeek: true,
      venueName: true,
    },
  }) as Promise<RefereeAvailabilityLeague[]>;
}

export function getLeagueDatesInMonth(input: {
  monthKey: string;
  dayOfWeek: PreferredNight;
}) {
  const targetDay = preferredNightToUtcDay(input.dayOfWeek);
  if (targetDay === null) return [];

  const bounds = getMonthBounds(input.monthKey);
  const dates: string[] = [];
  const current = new Date(bounds.start);

  while (current <= bounds.end) {
    if (current.getUTCDay() === targetDay) {
      dates.push(toDateKey(current));
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export async function getRefereesForAvailability() {
  return prisma.user.findMany({
    where: {
      role: {
        in: [UserRole.REFEREE, UserRole.ADMIN],
      },
      email: {
        not: null,
      },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

export async function ensureRefereeAvailabilityRows(input: {
  refereeId: string;
  monthKey: string;
  requested?: boolean;
}) {
  const leagues = await getActiveRefereeAvailabilityLeagues();
  const rows = leagues.flatMap((league) =>
    getLeagueDatesInMonth({ monthKey: input.monthKey, dayOfWeek: league.dayOfWeek }).map(
      (date) => ({ league, date }),
    ),
  );

  if (rows.length === 0) {
    return { created: 0, total: 0 };
  }

  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const result = await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RefereeAvailability" (
          "id", "refereeId", "leagueId", "availabilityDate", "requestedMonth", "lastRequestedAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${input.refereeId}, ${row.league.id}, ${row.date}::date, ${input.monthKey}, ${input.requested ? new Date() : null}, NOW()
        )
        ON CONFLICT ("refereeId", "leagueId", "availabilityDate") DO UPDATE
        SET
          "requestedMonth" = COALESCE("RefereeAvailability"."requestedMonth", EXCLUDED."requestedMonth"),
          "lastRequestedAt" = CASE
            WHEN ${input.requested ? 1 : 0} = 1 THEN NOW()
            ELSE "RefereeAvailability"."lastRequestedAt"
          END,
          "updatedAt" = NOW()
      `);

      created += Number(result ?? 0);
    }
  });

  return { created, total: rows.length };
}

function normaliseRawDate(value: string | Date) {
  if (value instanceof Date) return toDateKey(value);
  return String(value).slice(0, 10);
}

function normaliseStatus(value: string | null | undefined): RefereeAvailabilityStatus {
  if (value === "AVAILABLE" || value === "MAYBE" || value === "UNAVAILABLE") return value;
  return "NO_RESPONSE";
}

function toSlot(row: RawAvailabilityRow): RefereeAvailabilitySlot {
  return {
    id: row.id,
    leagueId: row.leagueId,
    leagueName: row.leagueName,
    leagueSeason: row.leagueSeason,
    venueName: row.venueName,
    dayOfWeek: row.dayOfWeek,
    date: normaliseRawDate(row.availabilityDate),
    status: normaliseStatus(row.status),
    note: row.note,
    respondedAt: row.respondedAt,
  };
}

export async function getRefereeAvailabilityMonth(input: {
  refereeId: string;
  monthKey: string;
}) {
  await ensureRefereeAvailabilityRows({ refereeId: input.refereeId, monthKey: input.monthKey });
  const bounds = getMonthBounds(input.monthKey);

  const rows = await prisma.$queryRaw<RawAvailabilityRow[]>(Prisma.sql`
    SELECT
      ra.id,
      l.id AS "leagueId",
      l.name AS "leagueName",
      l.season AS "leagueSeason",
      l."venueName" AS "venueName",
      l."dayOfWeek" AS "dayOfWeek",
      ra."availabilityDate" AS "availabilityDate",
      ra.status,
      ra.note,
      ra."respondedAt" AS "respondedAt"
    FROM "RefereeAvailability" ra
    JOIN "League" l ON l.id = ra."leagueId"
    WHERE ra."refereeId" = ${input.refereeId}
      AND ra."availabilityDate" >= ${bounds.startDate}::date
      AND ra."availabilityDate" <= ${bounds.endDate}::date
    ORDER BY ra."availabilityDate" ASC, l.name ASC
  `);

  const leagues = await getActiveRefereeAvailabilityLeagues();

  return {
    monthKey: input.monthKey,
    monthLabel: bounds.monthLabel,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    leagues,
    slots: rows.map(toSlot),
  } satisfies RefereeAvailabilityMonth;
}

export async function updateRefereeAvailability(input: {
  refereeId: string;
  updates: Array<{
    leagueId: string;
    date: string;
    status: RefereeAvailabilityStatus;
    note?: string | null;
  }>;
}) {
  const allowedStatuses = new Set<RefereeAvailabilityStatus>([
    "AVAILABLE",
    "MAYBE",
    "UNAVAILABLE",
    "NO_RESPONSE",
  ]);

  await prisma.$transaction(async (tx) => {
    for (const update of input.updates) {
      if (!allowedStatuses.has(update.status)) continue;

      await tx.$executeRaw(Prisma.sql`
        UPDATE "RefereeAvailability"
        SET
          "status" = ${update.status},
          "note" = ${update.note?.trim() || null},
          "respondedAt" = CASE WHEN ${update.status} = 'NO_RESPONSE' THEN NULL ELSE NOW() END,
          "updatedAt" = NOW()
        WHERE "refereeId" = ${input.refereeId}
          AND "leagueId" = ${update.leagueId}
          AND "availabilityDate" = ${update.date}::date
      `);
    }
  });
}

export async function getAdminRefereeAvailabilityMonth(monthKey: string) {
  const referees = await getRefereesForAvailability();

  await Promise.all(
    referees.map((referee) =>
      ensureRefereeAvailabilityRows({ refereeId: referee.id, monthKey }),
    ),
  );

  const bounds = getMonthBounds(monthKey);
  const rows = await prisma.$queryRaw<RawAdminAvailabilityRow[]>(Prisma.sql`
    SELECT
      ra.id,
      ra."refereeId" AS "refereeId",
      u.name AS "refereeName",
      u.email AS "refereeEmail",
      l.id AS "leagueId",
      l.name AS "leagueName",
      l.season AS "leagueSeason",
      l."venueName" AS "venueName",
      l."dayOfWeek" AS "dayOfWeek",
      ra."availabilityDate" AS "availabilityDate",
      ra.status,
      ra.note,
      ra."respondedAt" AS "respondedAt"
    FROM "RefereeAvailability" ra
    JOIN "User" u ON u.id = ra."refereeId"
    JOIN "League" l ON l.id = ra."leagueId"
    WHERE ra."availabilityDate" >= ${bounds.startDate}::date
      AND ra."availabilityDate" <= ${bounds.endDate}::date
    ORDER BY u.name ASC NULLS LAST, u.email ASC NULLS LAST, ra."availabilityDate" ASC, l.name ASC
  `);

  return {
    monthKey,
    monthLabel: bounds.monthLabel,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
    referees,
    rows: rows.map((row) => ({
      ...toSlot(row),
      refereeId: row.refereeId,
      refereeName: row.refereeName,
      refereeEmail: row.refereeEmail,
    })),
  };
}

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://www.sixfl.co.uk"
  ).replace(/\/+$/, "");
}

function getFirstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

async function hasAvailabilityRequestDispatch(input: { refereeId: string; monthKey: string }) {
  const existing = await prisma.notificationDispatch.findFirst({
    where: {
      sourceType: "REFEREE_AVAILABILITY_MONTHLY_REQUEST",
      sourceId: `${input.refereeId}:${input.monthKey}`,
      status: {
        in: ["QUEUED", "PROCESSING", "SENT"],
      },
    },
    select: { id: true },
  });

  return Boolean(existing);
}

export async function queueMonthlyRefereeAvailabilityRequests(input: {
  monthKey: string;
  force?: boolean;
}) {
  const referees = await getRefereesForAvailability();
  const bounds = getMonthBounds(input.monthKey);
  const availabilityUrl = `${getSiteUrl()}/referee/availability?month=${encodeURIComponent(input.monthKey)}`;
  const summary = {
    monthKey: input.monthKey,
    monthLabel: bounds.monthLabel,
    scannedReferees: referees.length,
    queued: 0,
    alreadyQueuedOrSent: 0,
    skipped: 0,
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const referee of referees) {
    try {
      if (!input.force && (await hasAvailabilityRequestDispatch({ refereeId: referee.id, monthKey: input.monthKey }))) {
        summary.alreadyQueuedOrSent += 1;
        continue;
      }

      const rows = await ensureRefereeAvailabilityRows({
        refereeId: referee.id,
        monthKey: input.monthKey,
        requested: true,
      });

      if (rows.total === 0 || !referee.email?.trim()) {
        summary.skipped += 1;
        continue;
      }

      const recipient = await upsertNotificationRecipient({
        sourceType: NotificationRecipientSourceType.REFEREE,
        sourceId: referee.id,
        audience: NotificationAudience.REFEREE,
        displayName: referee.name || referee.email,
        email: referee.email,
        transactionalEmailOptIn: true,
        transactionalSmsOptIn: true,
        metadata: {
          entityType: "REFEREE",
          refereeId: referee.id,
        },
      });

      await queueDirectNotification({
        recipientId: recipient.id,
        channel: NotificationChannel.EMAIL,
        audience: NotificationAudience.REFEREE,
        subject: `Please mark your SIXFL availability for ${bounds.monthLabel}`,
        body: [
          `Hi ${getFirstName(referee.name || referee.email)},`,
          "",
          `Please mark your referee availability for ${bounds.monthLabel}.`,
          "",
          "You will only see the dates where an active SIXFL league is due to run.",
          "",
          "Open your availability page here:",
          "{{cta}}",
          "",
          "Please tick Available, Maybe or Unavailable for each date so we can plan referee cover.",
        ].join("\n"),
        emailCta: {
          label: `Mark ${bounds.monthLabel} availability`,
          url: availabilityUrl,
        },
        sourceType: "REFEREE_AVAILABILITY_MONTHLY_REQUEST",
        sourceId: `${referee.id}:${input.monthKey}`,
        metadata: {
          origin: "referee_availability_monthly_request",
          refereeId: referee.id,
          monthKey: input.monthKey,
          monthLabel: bounds.monthLabel,
          availabilityUrl,
        },
      });

      summary.queued += 1;
    } catch (error) {
      summary.skipped += 1;
      if (summary.errors.length < 10) {
        summary.errors.push(
          `${referee.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  if (summary.queued > 0) {
    const processed = await processNotificationQueue(Math.max(summary.queued + 10, 25));
    summary.processed = processed.processed;
    summary.sent = processed.sent;
    summary.failed = processed.failed;
  }

  return summary;
}
