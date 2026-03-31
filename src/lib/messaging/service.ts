// ========================================
// File: src/lib/messaging/service.ts
// ========================================

import { Prisma, type InboxAlertStatus, type MessageThreadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/messaging/phone";

type NullableString = string | null | undefined;

type InboundSmsInput = {
  fromNumber: string | null;
  toNumber: string | null;
  body: string;
  messageSid?: string | null;
  accountSid?: string | null;
  rawPayload?: Prisma.InputJsonValue | null;
};

type RecordOutboundSmsInput = {
  notificationDispatchId?: string | null;
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  body: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  twilioMessageSid?: string | null;
  createdByUserId?: string | null;
  sentAt?: Date | null;
};

type InboxThreadListFilters = {
  status?: MessageThreadStatus | "ALL";
  unreadOnly?: boolean;
  teamId?: string | null;
  leagueId?: string | null;
  assignedToUserId?: string | null;
  limit?: number;
};

type UpdateThreadSummaryInput = {
  threadId: string;
};

function buildLastMessagePreview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function uppercaseKeyword(body: string): string {
  return body.trim().toUpperCase();
}

function isStopKeyword(body: string): boolean {
  return ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(
    uppercaseKeyword(body),
  );
}

function isStartKeyword(body: string): boolean {
  return ["START", "YES", "UNSTOP"].includes(uppercaseKeyword(body));
}

function isHelpKeyword(body: string): boolean {
  return ["HELP", "INFO"].includes(uppercaseKeyword(body));
}

async function findRecipientByPhone(phone: NullableString) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  return prisma.notificationRecipient.findFirst({
    where: {
      phoneNormalized: normalized,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

async function findExistingOpenThread(params: {
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  phoneNormalized?: string | null;
}) {
  const or: Prisma.MessageThreadWhereInput[] = [];

  if (params.recipientId) {
    or.push({
      recipientId: params.recipientId,
      status: "OPEN",
    });
  }

  if (params.teamId && params.phoneNormalized) {
    or.push({
      teamId: params.teamId,
      phoneNormalized: params.phoneNormalized,
      status: "OPEN",
    });
  }

  if (params.phoneNormalized) {
    or.push({
      phoneNormalized: params.phoneNormalized,
      status: "OPEN",
    });
  }

  if (or.length === 0) {
    return null;
  }

  return prisma.messageThread.findFirst({
    where: {
      OR: or,
    },
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
  });
}

async function createThreadFromRecipient(params: {
  recipient: {
    id: string;
    sourceType: string;
    sourceId: string | null;
    displayName: string | null;
    phone: string | null;
    phoneNormalized: string | null;
    metadata: Prisma.JsonValue | null;
  } | null;
  fallbackPhone: string | null;
}) {
  const metadata =
    params.recipient?.metadata && typeof params.recipient.metadata === "object"
      ? (params.recipient.metadata as Record<string, unknown>)
      : null;

  const metadataTeamId =
    metadata && typeof metadata.teamId === "string" ? metadata.teamId : null;
  const metadataLeagueId =
    metadata && typeof metadata.leagueId === "string" ? metadata.leagueId : null;
  const metadataContactName =
    metadata && typeof metadata.contactName === "string" ? metadata.contactName : null;

  return prisma.messageThread.create({
    data: {
      recipientId: params.recipient?.id ?? null,
      teamId: metadataTeamId,
      leagueId: metadataLeagueId,
      sourceType: params.recipient?.sourceType ?? "GENERAL",
      sourceId: params.recipient?.sourceId ?? null,
      contactName: params.recipient?.displayName ?? metadataContactName ?? null,
      contactPhone: params.recipient?.phone ?? params.fallbackPhone,
      phoneNormalized:
        params.recipient?.phoneNormalized ?? normalizePhoneNumber(params.fallbackPhone),
      status: "OPEN",
    },
  });
}

async function findOrCreateThreadForInbound(params: {
  fromNumber: string | null;
}) {
  const normalizedFrom = normalizePhoneNumber(params.fromNumber);
  const recipient = await findRecipientByPhone(normalizedFrom);

  const metadata =
    recipient?.metadata && typeof recipient.metadata === "object"
      ? (recipient.metadata as Record<string, unknown>)
      : null;

  const teamId =
    metadata && typeof metadata.teamId === "string" ? metadata.teamId : null;
  const leagueId =
    metadata && typeof metadata.leagueId === "string" ? metadata.leagueId : null;

  const existing = await findExistingOpenThread({
    recipientId: recipient?.id,
    teamId,
    leagueId,
    phoneNormalized: normalizedFrom,
  });

  if (existing) {
    return existing;
  }

  return createThreadFromRecipient({
    recipient: recipient
      ? {
          id: recipient.id,
          sourceType: recipient.sourceType,
          sourceId: recipient.sourceId,
          displayName: recipient.displayName,
          phone: recipient.phone,
          phoneNormalized: recipient.phoneNormalized,
          metadata: recipient.metadata,
        }
      : null,
    fallbackPhone: normalizedFrom,
  });
}

async function updateThreadSummary({ threadId }: UpdateThreadSummaryInput) {
  const [latestMessage, unreadInboundCount] = await Promise.all([
    prisma.messageEntry.findFirst({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.messageEntry.count({
      where: {
        threadId,
        direction: "INBOUND",
        readAt: null,
      },
    }),
  ]);

  const latestInbound = await prisma.messageEntry.findFirst({
    where: {
      threadId,
      direction: "INBOUND",
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      createdAt: true,
      receivedAt: true,
    },
  });

  const latestOutbound = await prisma.messageEntry.findFirst({
    where: {
      threadId,
      direction: "OUTBOUND",
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      createdAt: true,
      sentAt: true,
    },
  });

  await prisma.messageThread.update({
    where: { id: threadId },
    data: {
      latestMessageAt: latestMessage?.receivedAt ?? latestMessage?.sentAt ?? latestMessage?.createdAt ?? null,
      latestInboundAt: latestInbound?.receivedAt ?? latestInbound?.createdAt ?? null,
      latestOutboundAt: latestOutbound?.sentAt ?? latestOutbound?.createdAt ?? null,
      lastInboundMessageId: latestInbound?.id ?? null,
      lastOutboundMessageId: latestOutbound?.id ?? null,
      lastMessagePreview: latestMessage?.body ? buildLastMessagePreview(latestMessage.body) : null,
      unreadForAdminCount: unreadInboundCount,
    },
  });
}

async function createInboxAlert(messageId: string, threadId: string) {
  const existing = await prisma.inboxAlert.findUnique({
    where: {
      messageId,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.inboxAlert.create({
    data: {
      messageId,
      threadId,
      type: "NEW_INBOUND_SMS",
      status: "PENDING",
    },
  });
}

async function applyOptStatusFromKeyword(params: {
  recipientId: string | null;
  body: string;
}) {
  if (!params.recipientId) return;

  if (isStopKeyword(params.body)) {
    await prisma.notificationRecipient.update({
      where: { id: params.recipientId },
      data: {
        transactionalSmsOptIn: false,
        marketingSmsOptIn: false,
        isSuppressed: true,
        suppressionReason: "STOP",
      },
    });
    return;
  }

  if (isStartKeyword(params.body)) {
    await prisma.notificationRecipient.update({
      where: { id: params.recipientId },
      data: {
        transactionalSmsOptIn: true,
        isSuppressed: false,
        suppressionReason: null,
      },
    });
    return;
  }

  if (isHelpKeyword(params.body)) {
    return;
  }
}

export async function recordInboundSms(input: InboundSmsInput) {
  const normalizedFrom = normalizePhoneNumber(input.fromNumber);
  const normalizedTo = normalizePhoneNumber(input.toNumber);

  if (!normalizedFrom) {
    throw new Error("Inbound SMS missing valid from number.");
  }

  const thread = await findOrCreateThreadForInbound({
    fromNumber: normalizedFrom,
  });

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel: "SMS",
      direction: "INBOUND",
      participantRole: "CONTACT",
      body: input.body.trim(),
      fromNumber: normalizedFrom,
      toNumber: normalizedTo,
      provider: "twilio",
      providerMessageId: input.messageSid ?? null,
      providerStatus: "received",
      twilioMessageSid: input.messageSid ?? null,
      twilioAccountSid: input.accountSid ?? null,
      twilioPayload: input.rawPayload ?? Prisma.JsonNull,
      receivedAt: new Date(),
    },
  });

  await applyOptStatusFromKeyword({
    recipientId: thread.recipientId,
    body: input.body,
  });

  await createInboxAlert(entry.id, thread.id);
  await updateThreadSummary({ threadId: thread.id });

  return prisma.messageThread.findUnique({
    where: { id: thread.id },
    include: {
      recipient: true,
      team: true,
      league: true,
      messages: {
        orderBy: [{ createdAt: "asc" }],
      },
      alerts: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
}

export async function findOrCreateThreadForOutbound(params: {
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  contactName?: string | null;
  phone?: string | null;
}) {
  const normalizedPhone = normalizePhoneNumber(params.phone);

  const existing = await findExistingOpenThread({
    recipientId: params.recipientId,
    teamId: params.teamId,
    leagueId: params.leagueId,
    phoneNormalized: normalizedPhone,
  });

  if (existing) {
    return existing;
  }

  return prisma.messageThread.create({
    data: {
      recipientId: params.recipientId ?? null,
      teamId: params.teamId ?? null,
      leagueId: params.leagueId ?? null,
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
      contactName: params.contactName ?? null,
      contactPhone: params.phone ?? null,
      phoneNormalized: normalizedPhone,
      status: "OPEN",
    },
  });
}

export async function recordOutboundSms(input: RecordOutboundSmsInput) {
  const thread = await findOrCreateThreadForOutbound({
    recipientId: input.recipientId,
    teamId: input.teamId,
    leagueId: input.leagueId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    contactName: input.contactName,
    phone: input.toNumber ?? input.phone,
  });

  const entry = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel: "SMS",
      direction: "OUTBOUND",
      participantRole: input.createdByUserId ? "ADMIN" : "SYSTEM",
      body: input.body.trim(),
      fromNumber: normalizePhoneNumber(input.fromNumber),
      toNumber: normalizePhoneNumber(input.toNumber ?? input.phone),
      provider: input.provider ?? "twilio",
      providerMessageId: input.providerMessageId ?? null,
      providerStatus: input.providerStatus ?? null,
      twilioMessageSid: input.twilioMessageSid ?? null,
      notificationDispatchId: input.notificationDispatchId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      sentAt: input.sentAt ?? new Date(),
    },
  });

  await updateThreadSummary({ threadId: thread.id });

  return {
    threadId: thread.id,
    messageEntryId: entry.id,
  };
}

export async function markThreadAsReadForAdmin(threadId: string) {
  const now = new Date();

  await prisma.$transaction([
    prisma.messageEntry.updateMany({
      where: {
        threadId,
        direction: "INBOUND",
        readAt: null,
      },
      data: {
        readAt: now,
      },
    }),
    prisma.inboxAlert.updateMany({
      where: {
        threadId,
        status: {
          in: ["PENDING", "SENT"] satisfies InboxAlertStatus[],
        },
      },
      data: {
        status: "READ",
        readAt: now,
      },
    }),
    prisma.messageThread.update({
      where: { id: threadId },
      data: {
        unreadForAdminCount: 0,
      },
    }),
  ]);

  await updateThreadSummary({ threadId });

  return prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      recipient: true,
      team: true,
      league: true,
      messages: {
        orderBy: [{ createdAt: "asc" }],
      },
      alerts: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
}

export async function archiveMessageThread(threadId: string) {
  return prisma.messageThread.update({
    where: { id: threadId },
    data: {
      status: "ARCHIVED",
    },
  });
}

export async function reopenMessageThread(threadId: string) {
  return prisma.messageThread.update({
    where: { id: threadId },
    data: {
      status: "OPEN",
    },
  });
}

export async function getAdminInboxSummary() {
  const [unreadThreads, openThreads, unreadMessages, latestInbound] = await Promise.all([
    prisma.messageThread.count({
      where: {
        unreadForAdminCount: {
          gt: 0,
        },
      },
    }),
    prisma.messageThread.count({
      where: {
        status: "OPEN",
      },
    }),
    prisma.messageEntry.count({
      where: {
        direction: "INBOUND",
        readAt: null,
      },
    }),
    prisma.messageEntry.findFirst({
      where: {
        direction: "INBOUND",
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        thread: {
          include: {
            team: true,
            league: true,
            recipient: true,
          },
        },
      },
    }),
  ]);

  return {
    unreadThreads,
    openThreads,
    unreadMessages,
    latestInbound,
  };
}

export async function getAdminInboxThreads(filters: InboxThreadListFilters = {}) {
  const limit = filters.limit ?? 50;

  const where: Prisma.MessageThreadWhereInput = {};

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.unreadOnly) {
    where.unreadForAdminCount = {
      gt: 0,
    };
  }

  if (filters.teamId) {
    where.teamId = filters.teamId;
  }

  if (filters.leagueId) {
    where.leagueId = filters.leagueId;
  }

  if (filters.assignedToUserId) {
    where.assignedToUserId = filters.assignedToUserId;
  }

  return prisma.messageThread.findMany({
    where,
    include: {
      recipient: true,
      team: true,
      league: true,
      assignedToUser: true,
      messages: {
        orderBy: [{ createdAt: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ unreadForAdminCount: "desc" }, { latestMessageAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });
}

export async function getMessageThreadById(threadId: string) {
  return prisma.messageThread.findUnique({
    where: {
      id: threadId,
    },
    include: {
      recipient: true,
      team: true,
      league: true,
      assignedToUser: true,
      messages: {
        orderBy: [{ createdAt: "asc" }],
      },
      alerts: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });
}

export async function dismissInboxAlertByMessageId(messageId: string) {
  return prisma.inboxAlert.updateMany({
    where: {
      messageId,
    },
    data: {
      status: "DISMISSED",
      dismissedAt: new Date(),
    },
  });
}

export async function sendHelpKeywordSideEffects(): Promise<void> {
  return;
}

export async function linkDispatchToThread(params: {
  dispatchId: string;
  recipientId?: string | null;
  teamId?: string | null;
  leagueId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  contactName?: string | null;
  phone?: string | null;
  body: string;
  fromNumber?: string | null;
  toNumber?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  twilioMessageSid?: string | null;
  createdByUserId?: string | null;
  sentAt?: Date | null;
}) {
  return recordOutboundSms({
    notificationDispatchId: params.dispatchId,
    recipientId: params.recipientId,
    teamId: params.teamId,
    leagueId: params.leagueId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    contactName: params.contactName,
    phone: params.phone,
    body: params.body,
    fromNumber: params.fromNumber,
    toNumber: params.toNumber,
    provider: params.provider,
    providerMessageId: params.providerMessageId,
    providerStatus: params.providerStatus,
    twilioMessageSid: params.twilioMessageSid,
    createdByUserId: params.createdByUserId,
    sentAt: params.sentAt,
  });
}