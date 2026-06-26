// ========================================
// File: src/lib/referee-night-emails.ts
// ========================================

import {
  NotificationAudience,
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  Prisma,
} from "@prisma/client";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import {
  formatKickoffTime,
  formatMoney,
  formatNightDate,
  getRefereeNightById,
  getRefereeNightFixtures,
} from "@/lib/referee-nights";
import { getPublicSiteUrl } from "@/lib/stripe/client";

type RefereeNightEmailMode = "booked" | "reminder24h";

type RefereeNightEmailTemplate = {
  key: string;
  name: string;
  description: string;
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrlKey: string;
};

const REFEREE_NIGHT_TEMPLATE_KEYS: Record<RefereeNightEmailMode, string> = {
  booked: "referee-night-booked-email",
  reminder24h: "referee-night-reminder-24h-email",
};

const REFEREE_NIGHT_SOURCE_TYPES: Record<RefereeNightEmailMode, string> = {
  booked: "REFEREE_NIGHT_BOOKED",
  reminder24h: "REFEREE_NIGHT_REMINDER_24H",
};

const REFEREE_NIGHT_EMAIL_TEMPLATES: RefereeNightEmailTemplate[] = [
  {
    key: REFEREE_NIGHT_TEMPLATE_KEYS.booked,
    name: "Referee night booked email",
    description: "Sent when a referee is booked for a night. Does not include fixtures.",
    subject: "SIXFL referee booking: {{nightLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "You are booked to referee for SIXFL on {{nightLabel}} at {{venueName}}.",
      "",
      "League: {{leagueName}}",
      "",
      "We will send your assigned fixtures and night fee 24 hours before the first kick-off.",
      "",
      "{{cta}}",
    ].join("\n"),
    ctaLabel: "Open referee dashboard",
    ctaUrlKey: "refereeDashboardUrl",
  },
  {
    key: REFEREE_NIGHT_TEMPLATE_KEYS.reminder24h,
    name: "Referee night 24 hour reminder email",
    description: "Sent 24 hours before the first kick-off with fixtures and night fee.",
    subject: "SIXFL referee fixtures: {{nightLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "You are refereeing for SIXFL tomorrow.",
      "",
      "Night: {{nightLabel}}",
      "Venue: {{venueName}}",
      "League: {{leagueName}}",
      "Night fee: {{nightFee}}",
      "",
      "Your fixtures:",
      "",
      "{{fixturesList}}",
      "",
      "Please arrive in good time before the first kick-off. After the final game, enter the scores, record any money collected and submit your night cashup from your referee dashboard.",
      "",
      "{{cta}}",
    ].join("\n"),
    ctaLabel: "Open referee night",
    ctaUrlKey: "refereeNightUrl",
  },
];

function getFirstName(value?: string | null) {
  const source = value?.trim() || "there";
  return source.split(/\s+/)[0] || "there";
}

function getFixtureLabel(input: {
  kickoffAt: Date;
  homeTeam: { name: string };
  awayTeam: { name: string };
  pitch?: string | null;
}) {
  const pitch = input.pitch?.trim() ? ` · ${input.pitch.trim()}` : "";
  return `${formatKickoffTime(input.kickoffAt)} - ${input.homeTeam.name} v ${input.awayTeam.name}${pitch}`;
}

async function hasRefereeNightDispatch(input: {
  refereeNightId: string;
  mode: RefereeNightEmailMode;
}) {
  return prisma.notificationDispatch.findFirst({
    where: {
      sourceType: REFEREE_NIGHT_SOURCE_TYPES[input.mode],
      sourceId: input.refereeNightId,
      channel: NotificationChannel.EMAIL,
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

export async function ensureRefereeNightEmailTemplates() {
  await Promise.all(
    REFEREE_NIGHT_EMAIL_TEMPLATES.map((template) =>
      prisma.notificationTemplate.upsert({
        where: { key: template.key },
        update: {
          name: template.name,
          description: template.description,
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.REFEREE,
          subject: template.subject,
          body: template.body,
          ctaLabel: template.ctaLabel,
          ctaUrlKey: template.ctaUrlKey,
          isActive: true,
        },
        create: {
          key: template.key,
          name: template.name,
          description: template.description,
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: NotificationChannel.EMAIL,
          audience: NotificationAudience.REFEREE,
          subject: template.subject,
          body: template.body,
          ctaLabel: template.ctaLabel,
          ctaUrlKey: template.ctaUrlKey,
          isActive: true,
        },
      }),
    ),
  );
}

async function getRefereeForNight(refereeId: string) {
  return prisma.user.findUnique({
    where: { id: refereeId },
    select: {
      id: true,
      name: true,
      email: true,
      createdFromLeadId: true,
    },
  });
}

async function getRefereePhone(createdFromLeadId?: string | null) {
  if (!createdFromLeadId) return null;

  const lead = await prisma.interestLead.findUnique({
    where: { id: createdFromLeadId },
    select: { phone: true },
  });

  return lead?.phone ?? null;
}

async function getRefereeNightRecipient(input: {
  refereeId: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.REFEREE,
    sourceId: input.refereeId,
    audience: NotificationAudience.REFEREE,
    displayName: input.displayName,
    email: input.email,
    phone: input.phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      userId: input.refereeId,
      entityType: "REFEREE",
    },
  });
}

function buildDashboardUrl() {
  return new URL("/referee", `${getPublicSiteUrl()}/`).toString();
}

function buildNightUrl(refereeNightId: string) {
  return new URL(`/referee/night/${refereeNightId}`, `${getPublicSiteUrl()}/`).toString();
}

async function buildVariables(input: {
  refereeNightId: string;
  includeFixtures: boolean;
}) {
  const [night, fixtures] = await Promise.all([
    getRefereeNightById(input.refereeNightId),
    input.includeFixtures ? getRefereeNightFixtures(input.refereeNightId) : Promise.resolve([]),
  ]);

  if (!night) return null;

  const referee = await getRefereeForNight(night.refereeId);
  if (!referee?.email?.trim()) return null;

  const phone = await getRefereePhone(referee.createdFromLeadId);
  const recipient = await getRefereeNightRecipient({
    refereeId: referee.id,
    displayName: referee.name || referee.email,
    email: referee.email,
    phone,
  });

  const fixtureList = fixtures.length
    ? fixtures.map(getFixtureLabel).join("\n")
    : "Fixtures will be confirmed separately.";

  return {
    night,
    referee,
    recipient,
    variables: {
      firstName: getFirstName(referee.name || referee.email),
      fullName: referee.name || referee.email || "Referee",
      nightLabel: formatNightDate(night.nightDate),
      venueName: night.venueName || "venue TBC",
      leagueName: `${night.leagueName}${night.leagueSeason ? ` · ${night.leagueSeason}` : ""}`,
      nightFee: formatMoney(night.feePence),
      fixturesList: fixtureList,
      refereeDashboardUrl: buildDashboardUrl(),
      refereeNightUrl: buildNightUrl(night.id),
    },
  };
}

export async function queueRefereeNightBookedEmail(input: {
  refereeNightId: string;
  createdByUserId?: string | null;
}) {
  await ensureRefereeNightEmailTemplates();

  const existing = await hasRefereeNightDispatch({
    refereeNightId: input.refereeNightId,
    mode: "booked",
  });

  if (existing) return { queued: 0, skipped: 0, status: "already_sent" as const };

  const context = await buildVariables({
    refereeNightId: input.refereeNightId,
    includeFixtures: false,
  });

  if (!context) return { queued: 0, skipped: 1, status: "missing_context" as const };

  const dispatch = await queueNotificationFromTemplate({
    templateKey: REFEREE_NIGHT_TEMPLATE_KEYS.booked,
    recipientId: context.recipient.id,
    variables: context.variables,
    sourceType: REFEREE_NIGHT_SOURCE_TYPES.booked,
    sourceId: input.refereeNightId,
    metadata: {
      origin: "referee_night_automation",
      mode: "booked",
      refereeNightId: input.refereeNightId,
      refereeId: context.referee.id,
    },
    scheduledFor: new Date(),
    createdByUserId: input.createdByUserId,
  });

  return {
    queued: dispatch.status === NotificationDispatchStatus.QUEUED ? 1 : 0,
    skipped: dispatch.status === NotificationDispatchStatus.SKIPPED ? 1 : 0,
    status: dispatch.status,
  };
}

export async function queueRefereeNightReminderEmail(input: {
  refereeNightId: string;
}) {
  await ensureRefereeNightEmailTemplates();

  const existing = await hasRefereeNightDispatch({
    refereeNightId: input.refereeNightId,
    mode: "reminder24h",
  });

  if (existing) return { queued: 0, skipped: 0, status: "already_sent" as const };

  const context = await buildVariables({
    refereeNightId: input.refereeNightId,
    includeFixtures: true,
  });

  if (!context) return { queued: 0, skipped: 1, status: "missing_context" as const };

  const dispatch = await queueNotificationFromTemplate({
    templateKey: REFEREE_NIGHT_TEMPLATE_KEYS.reminder24h,
    recipientId: context.recipient.id,
    variables: context.variables,
    sourceType: REFEREE_NIGHT_SOURCE_TYPES.reminder24h,
    sourceId: input.refereeNightId,
    metadata: {
      origin: "referee_night_automation",
      mode: "reminder24h",
      refereeNightId: input.refereeNightId,
      refereeId: context.referee.id,
    },
    scheduledFor: new Date(),
  });

  return {
    queued: dispatch.status === NotificationDispatchStatus.QUEUED ? 1 : 0,
    skipped: dispatch.status === NotificationDispatchStatus.SKIPPED ? 1 : 0,
    status: dispatch.status,
  };
}

export async function queueDueRefereeNightReminderEmails(input?: { now?: Date }) {
  await ensureRefereeNightEmailTemplates();

  const now = input?.now ?? new Date();
  const dueBy = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<
    Array<{
      refereeNightId: string;
      firstKickoffAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      rn.id AS "refereeNightId",
      MIN(f."kickoffAt") AS "firstKickoffAt"
    FROM "RefereeNight" rn
    JOIN "RefereeNightFixture" rnf ON rnf."refereeNightId" = rn.id
    JOIN "Fixture" f ON f.id = rnf."fixtureId"
    WHERE rn.status NOT IN ('CANCELLED', 'SETTLED')
    GROUP BY rn.id
    HAVING MIN(f."kickoffAt") > ${now} AND MIN(f."kickoffAt") <= ${dueBy}
    ORDER BY MIN(f."kickoffAt") ASC
    LIMIT 100
  `);

  const summary = {
    scanned: rows.length,
    queued: 0,
    skipped: 0,
    alreadySent: 0,
  };

  for (const row of rows) {
    const result = await queueRefereeNightReminderEmail({
      refereeNightId: row.refereeNightId,
    });

    summary.queued += result.queued;
    summary.skipped += result.skipped;

    if (result.status === "already_sent") {
      summary.alreadySent += 1;
    }
  }

  return summary;
}

export function formatRefereeNightFirstKickoffForAdmin(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
