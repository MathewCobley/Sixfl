// ========================================
// File: src/lib/payments/player-match-fees.ts
// ========================================

import { randomBytes } from "node:crypto";
import {
  NotificationAudience,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  NotificationTemplateKind,
  PlayerMatchFeeStatus,
} from "@prisma/client";

import { logNotificationDispatchToThread } from "@/lib/communications/log-dispatch";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { getPhoneDisplayValue } from "@/lib/notifications/phone";
import { upsertNotificationRecipient } from "@/lib/notifications/recipients";
import { queueNotificationFromTemplate } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { getPublicSiteUrl } from "@/lib/stripe/client";
import { getTeamMemberProfilesByTeamMemberIds } from "@/lib/teamMemberProfiles";

type PlayerMatchFeeReminderMode = "request" | "chase24h" | "chase72h";
type ReminderChannel = "EMAIL" | "SMS";

type PlayerMatchFeeReminderTemplate = {
  key: string;
  name: string;
  description: string;
  channel: ReminderChannel;
  subject: string | null;
  body: string;
  ctaLabel: string | null;
  ctaUrlKey: string | null;
};

type TeamPaymentDispatchBoundaryRow = {
  teamMode: string;
  standardCreditStartedAt: Date | null;
};

const PLAYER_MATCH_FEE_SOURCE_TYPES: Record<PlayerMatchFeeReminderMode, string> = {
  request: "PLAYER_MATCH_FEE_REQUEST",
  chase24h: "PLAYER_MATCH_FEE_CHASE_24H",
  chase72h: "PLAYER_MATCH_FEE_CHASE_72H",
};

const PLAYER_MATCH_FEE_TEMPLATE_KEYS: Record<
  PlayerMatchFeeReminderMode,
  Record<ReminderChannel, string>
> = {
  request: {
    EMAIL: "player-match-fee-request-email",
    SMS: "player-match-fee-request-sms",
  },
  chase24h: {
    EMAIL: "player-match-fee-chase-24h-email",
    SMS: "player-match-fee-chase-24h-sms",
  },
  chase72h: {
    EMAIL: "player-match-fee-chase-72h-email",
    SMS: "player-match-fee-chase-72h-sms",
  },
};

const PLAYER_MATCH_FEE_SYSTEM_TEMPLATES: PlayerMatchFeeReminderTemplate[] = [
  {
    key: PLAYER_MATCH_FEE_TEMPLATE_KEYS.request.EMAIL,
    name: "Player match fee payment request email",
    description: "Initial player match fee email with a direct payment link.",
    channel: "EMAIL",
    subject: "Match fee due for {{fixtureLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Your match fee for {{fixtureLabel}} is now due.",
      "",
      "Amount: {{amount}}",
      "",
      "Please use the secure link below to pay:",
      "",
      "{{cta}}",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    ctaLabel: "Pay match fee",
    ctaUrlKey: "paymentUrl",
  },
  {
    key: PLAYER_MATCH_FEE_TEMPLATE_KEYS.request.SMS,
    name: "Player match fee payment request SMS",
    description: "Initial player match fee SMS with a direct payment link.",
    channel: "SMS",
    subject: null,
    body: "{{amount}} match fee due. Pay: {{paymentUrl}}",
    ctaLabel: null,
    ctaUrlKey: null,
  },
  {
    key: PLAYER_MATCH_FEE_TEMPLATE_KEYS.chase24h.EMAIL,
    name: "Player match fee 24h chase email",
    description: "24-hour chase email for unpaid player match fees.",
    channel: "EMAIL",
    subject: "Reminder: match fee still due for {{fixtureLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Just a reminder that your {{amount}} match fee for {{fixtureLabel}} is still outstanding.",
      "",
      "Please pay using the secure link below:",
      "",
      "{{cta}}",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    ctaLabel: "Pay match fee",
    ctaUrlKey: "paymentUrl",
  },
  {
    key: PLAYER_MATCH_FEE_TEMPLATE_KEYS.chase24h.SMS,
    name: "Player match fee 24h chase SMS",
    description: "24-hour chase SMS for unpaid player match fees.",
    channel: "SMS",
    subject: null,
    body: "Reminder: {{amount}} match fee due. Pay: {{paymentUrl}}",
    ctaLabel: null,
    ctaUrlKey: null,
  },
  {
    key: PLAYER_MATCH_FEE_TEMPLATE_KEYS.chase72h.EMAIL,
    name: "Player match fee 72h final chase email",
    description: "72-hour final chase email for unpaid player match fees.",
    channel: "EMAIL",
    subject: "Final reminder: match fee still unpaid for {{fixtureLabel}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Final reminder that your {{amount}} match fee for {{fixtureLabel}} is still unpaid.",
      "",
      "Please pay using the secure link below as soon as possible:",
      "",
      "{{cta}}",
      "",
      "Thanks,",
      "SIXFL",
    ].join("\n"),
    ctaLabel: "Pay match fee",
    ctaUrlKey: "paymentUrl",
  },
  {
    key: PLAYER_MATCH_FEE_TEMPLATE_KEYS.chase72h.SMS,
    name: "Player match fee 72h final chase SMS",
    description: "72-hour final chase SMS with a direct payment link.",
    channel: "SMS",
    subject: null,
    body: "Final reminder: {{amount}} match fee due. Pay: {{paymentUrl}}",
    ctaLabel: null,
    ctaUrlKey: null,
  },
];

function createPlayerMatchFeeToken() {
  return randomBytes(24).toString("hex");
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function formatKickoff(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFirstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? "";
}

function getSourceId(feeId: string) {
  return feeId;
}

async function getStandardTeamPaymentDispatchBoundary(teamId: string) {
  try {
    const rows = await prisma.$queryRaw<TeamPaymentDispatchBoundaryRow[]>`
      SELECT
        "teamMode"::text AS "teamMode",
        "standardCreditStartedAt" AS "standardCreditStartedAt"
      FROM "Team"
      WHERE "id" = ${teamId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row || row.teamMode !== "STANDARD") return null;
    return row.standardCreditStartedAt ?? null;
  } catch {
    // Older/local databases may not yet have the raw transition-boundary column.
    // In that case retain the legacy dedupe behaviour rather than blocking payment requests.
    return null;
  }
}

async function getPlayerMatchFeeDispatchBoundary(feeId: string) {
  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: feeId },
    select: { teamId: true },
  });

  return fee?.teamId ? getStandardTeamPaymentDispatchBoundary(fee.teamId) : null;
}

export function buildPlayerMatchFeePaymentPath(paymentToken: string) {
  return `/pay/player-match-fee/${paymentToken}`;
}

export function buildPlayerMatchFeePaymentUrl(paymentToken: string) {
  return new URL(
    buildPlayerMatchFeePaymentPath(paymentToken),
    `${getPublicSiteUrl()}/`,
  ).toString();
}

export async function ensurePlayerMatchFeePaymentDetails(feeId: string) {
  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: feeId },
    select: {
      id: true,
      paymentToken: true,
      paymentUrl: true,
      status: true,
    },
  });

  if (!fee) return null;

  if (fee.status !== PlayerMatchFeeStatus.OPEN) {
    return fee;
  }

  const token = fee.paymentToken || createPlayerMatchFeeToken();
  const paymentUrl = buildPlayerMatchFeePaymentUrl(token);

  if (fee.paymentToken === token && fee.paymentUrl === paymentUrl) {
    return fee;
  }

  return prisma.playerMatchFee.update({
    where: { id: fee.id },
    data: {
      paymentToken: token,
      paymentUrl,
    },
    select: {
      id: true,
      paymentToken: true,
      paymentUrl: true,
      status: true,
    },
  });
}

export async function ensurePlayerMatchFeePaymentDetailsForFees(feeIds: string[]) {
  const uniqueFeeIds = Array.from(new Set(feeIds.filter(Boolean)));

  for (const feeId of uniqueFeeIds) {
    await ensurePlayerMatchFeePaymentDetails(feeId);
  }
}

export async function ensurePlayerMatchFeeReminderTemplates() {
  await Promise.all(
    PLAYER_MATCH_FEE_SYSTEM_TEMPLATES.map((template) =>
      prisma.notificationTemplate.upsert({
        where: { key: template.key },
        update: {
          name: template.name,
          description: template.description,
          kind: NotificationTemplateKind.TRANSACTIONAL,
          channel: template.channel,
          audience: NotificationAudience.PLAYER,
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
          channel: template.channel,
          audience: NotificationAudience.PLAYER,
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

async function hasPlayerMatchFeeDispatch(input: {
  feeId: string;
  mode: PlayerMatchFeeReminderMode;
  channel?: ReminderChannel;
  notBefore?: Date | null;
}) {
  return prisma.notificationDispatch.findFirst({
    where: {
      sourceType: PLAYER_MATCH_FEE_SOURCE_TYPES[input.mode],
      sourceId: getSourceId(input.feeId),
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.notBefore ? { createdAt: { gte: input.notBefore } } : {}),
      status: {
        in: [
          NotificationDispatchStatus.QUEUED,
          NotificationDispatchStatus.PROCESSING,
          NotificationDispatchStatus.SENT,
        ],
      },
    },
    select: {
      id: true,
      channel: true,
      createdAt: true,
      sentAt: true,
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

async function getPlayerMatchFeeReminderMode(input: {
  feeId: string;
  now: Date;
}): Promise<PlayerMatchFeeReminderMode | null> {
  const dispatchNotBefore = await getPlayerMatchFeeDispatchBoundary(input.feeId);
  const initial = await hasPlayerMatchFeeDispatch({
    feeId: input.feeId,
    mode: "request",
    notBefore: dispatchNotBefore,
  });
  const initialSms = await hasPlayerMatchFeeDispatch({
    feeId: input.feeId,
    mode: "request",
    channel: "SMS",
    notBefore: dispatchNotBefore,
  });

  if (!initial || !initialSms) return "request";

  const initialAt = initial.sentAt ?? initial.createdAt;
  const hoursSinceInitial =
    (input.now.getTime() - initialAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceInitial >= 72) {
    const chase72 = await hasPlayerMatchFeeDispatch({
      feeId: input.feeId,
      mode: "chase72h",
      notBefore: dispatchNotBefore,
    });
    const chase72Sms = await hasPlayerMatchFeeDispatch({
      feeId: input.feeId,
      mode: "chase72h",
      channel: "SMS",
      notBefore: dispatchNotBefore,
    });

    if (!chase72 || !chase72Sms) return "chase72h";
  }

  if (hoursSinceInitial >= 24) {
    const chase24 = await hasPlayerMatchFeeDispatch({
      feeId: input.feeId,
      mode: "chase24h",
      notBefore: dispatchNotBefore,
    });
    const chase24Sms = await hasPlayerMatchFeeDispatch({
      feeId: input.feeId,
      mode: "chase24h",
      channel: "SMS",
      notBefore: dispatchNotBefore,
    });

    if (!chase24 || !chase24Sms) return "chase24h";
  }

  return null;
}

function getPlayerName(input: {
  teamMember: { user: { name: string | null; email: string | null } } | null;
  prospect: { firstName: string; lastName: string | null; email: string | null } | null;
}) {
  if (input.teamMember) {
    return input.teamMember.user.name || input.teamMember.user.email || "Player";
  }

  if (input.prospect) {
    return [input.prospect.firstName, input.prospect.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || input.prospect.email || "Player";
  }

  return "Player";
}

export async function queuePlayerMatchFeeReminder(input: {
  feeId: string;
  mode: PlayerMatchFeeReminderMode;
  channels?: ReminderChannel[];
  force?: boolean;
}) {
  await ensurePlayerMatchFeeReminderTemplates();
  const ensured = await ensurePlayerMatchFeePaymentDetails(input.feeId);

  if (!ensured || ensured.status !== PlayerMatchFeeStatus.OPEN) {
    return { queued: 0, skipped: 1, status: "not_open" as const };
  }

  const requestedChannels = new Set<ReminderChannel>(
    input.channels?.length ? input.channels : ["EMAIL", "SMS"],
  );
  const shouldQueueEmail = requestedChannels.has("EMAIL");
  const shouldQueueSms = requestedChannels.has("SMS");

  const fee = await prisma.playerMatchFee.findUnique({
    where: { id: input.feeId },
    select: {
      id: true,
      amountPence: true,
      paymentUrl: true,
      paymentToken: true,
      team: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
      fixture: {
        select: {
          id: true,
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
      teamMemberId: true,
      teamMember: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      prospect: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  });

  if (!fee?.paymentUrl) {
    return { queued: 0, skipped: 1, status: "no_payment_url" as const };
  }

  const playerName = getPlayerName({
    teamMember: fee.teamMember,
    prospect: fee.prospect,
  });
  const email = fee.teamMember?.user.email?.trim() || fee.prospect?.email?.trim() || null;
  let phone = getPhoneDisplayValue(fee.prospect?.phone ?? null);

  if (!phone && fee.teamMemberId) {
    const profiles = await getTeamMemberProfilesByTeamMemberIds([fee.teamMemberId]);
    phone = getPhoneDisplayValue(profiles.get(fee.teamMemberId)?.phone ?? null);
  }

  if ((!shouldQueueEmail || !email) && (!shouldQueueSms || !phone)) {
    return { queued: 0, skipped: 1, status: "no_contact" as const };
  }

  const dispatchNotBefore = await getStandardTeamPaymentDispatchBoundary(fee.team.id);
  const existingEmailDispatch = shouldQueueEmail && !input.force
    ? await hasPlayerMatchFeeDispatch({
        feeId: fee.id,
        mode: input.mode,
        channel: "EMAIL",
        notBefore: dispatchNotBefore,
      })
    : null;
  const existingSmsDispatch = shouldQueueSms && !input.force
    ? await hasPlayerMatchFeeDispatch({
        feeId: fee.id,
        mode: input.mode,
        channel: "SMS",
        notBefore: dispatchNotBefore,
      })
    : null;

  if (
    (!shouldQueueEmail || !email || existingEmailDispatch) &&
    (!shouldQueueSms || !phone || existingSmsDispatch)
  ) {
    return { queued: 0, skipped: 0, status: "already_sent" as const };
  }

  const recipient = await upsertNotificationRecipient({
    sourceType: NotificationRecipientSourceType.GENERAL,
    sourceId: `player-match-fee:${fee.id}`,
    audience: NotificationAudience.PLAYER,
    displayName: playerName,
    email,
    phone,
    transactionalEmailOptIn: true,
    transactionalSmsOptIn: true,
    marketingEmailOptIn: true,
    marketingSmsOptIn: true,
    metadata: {
      playerMatchFeeId: fee.id,
      teamId: fee.team.id,
      teamMemberId: fee.teamMember?.id ?? null,
      prospectId: fee.prospect?.id ?? null,
      entityType: "PLAYER_MATCH_FEE",
    },
  });

  const fixtureLabel = `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name} · ${formatKickoff(fee.fixture.kickoffAt)}`;
  const leagueName = fee.team.league
    ? `${fee.team.league.name}${fee.team.league.season ? ` · ${fee.team.league.season}` : ""}`
    : "";
  const variables = {
    firstName: getFirstName(playerName),
    fullName: playerName,
    teamName: fee.team.name,
    leagueName,
    fixtureLabel,
    fixtureName: `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`,
    kickoffDateTime: formatKickoff(fee.fixture.kickoffAt),
    amount: formatMoney(fee.amountPence),
    paymentUrl: fee.paymentUrl,
  };

  let queued = 0;
  let skipped = 0;

  if (shouldQueueEmail && email && !existingEmailDispatch) {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_MATCH_FEE_TEMPLATE_KEYS[input.mode].EMAIL,
      recipientId: recipient.id,
      variables,
      sourceType: PLAYER_MATCH_FEE_SOURCE_TYPES[input.mode],
      sourceId: getSourceId(fee.id),
      metadata: {
        origin: "player_match_fee_automation",
        originLabel: "Player match fee automation",
        mode: input.mode,
        manualResend: Boolean(input.force),
        playerMatchFeeId: fee.id,
        fixtureId: fee.fixture.id,
        teamId: fee.team.id,
        paymentUrl: fee.paymentUrl,
      },
      emailBranding: {
        teamName: fee.team.name,
        teamLogoUrl: fee.team.logoUrl,
        leagueName,
      },
      paymentSummary: {
        amount: formatMoney(fee.amountPence),
        reason: `${fee.fixture.homeTeam.name} vs ${fee.fixture.awayTeam.name}`,
      },
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
    else skipped += 1;
  }

  if (shouldQueueSms && phone && !existingSmsDispatch) {
    const dispatch = await queueNotificationFromTemplate({
      templateKey: PLAYER_MATCH_FEE_TEMPLATE_KEYS[input.mode].SMS,
      recipientId: recipient.id,
      variables,
      sourceType: PLAYER_MATCH_FEE_SOURCE_TYPES[input.mode],
      sourceId: getSourceId(fee.id),
      metadata: {
        origin: "player_match_fee_automation",
        originLabel: "Player match fee automation",
        mode: input.mode,
        manualResend: Boolean(input.force),
        playerMatchFeeId: fee.id,
        fixtureId: fee.fixture.id,
        teamId: fee.team.id,
        paymentUrl: fee.paymentUrl,
      },
    });

    await logNotificationDispatchToThread({ dispatch, recipient });

    if (dispatch.status === NotificationDispatchStatus.QUEUED) queued += 1;
    else skipped += 1;
  }

  if (queued > 0) {
    await prisma.playerMatchFee.update({
      where: { id: fee.id },
      data: { lastChasedAt: new Date() },
    });
  }

  return { queued, skipped, status: queued > 0 ? "queued" as const : "already_sent" as const };
}

export async function queueDuePlayerMatchFeeReminders(input?: { now?: Date }) {
  await ensurePlayerMatchFeeReminderTemplates();

  const now = input?.now ?? new Date();
  const openFees = await prisma.playerMatchFee.findMany({
    where: {
      status: PlayerMatchFeeStatus.OPEN,
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
    },
    take: 100,
  });

  const summary = {
    scanned: openFees.length,
    queued: 0,
    skipped: 0,
    alreadySent: 0,
    byMode: {
      request: 0,
      chase24h: 0,
      chase72h: 0,
    },
  };

  for (const fee of openFees) {
    const mode = await getPlayerMatchFeeReminderMode({
      feeId: fee.id,
      now,
    });

    if (!mode) {
      summary.skipped += 1;
      continue;
    }

    const result = await queuePlayerMatchFeeReminder({
      feeId: fee.id,
      mode,
    });

    summary.queued += result.queued;
    summary.skipped += result.skipped;
    summary.byMode[mode] += result.queued;

    if (result.status === "already_sent") {
      summary.alreadySent += 1;
    }
  }

  return summary;
}
