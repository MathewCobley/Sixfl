// ========================================
// File: src/lib/email/inbound.ts
// ========================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  extractThreadIdFromReplyAddress,
  parseThreadReplyAddress,
} from "@/lib/email/reply-address";
import { getResendClient } from "@/lib/resend/client";
import type { ResendWebhookEvent } from "@/lib/resend/verifyWebhook";

type ReceivedEmailHeader = {
  name?: string;
  value?: string;
};

type ReceivedEmailHeaderMapValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean | null | undefined>;

type ReceivedEmailContent = {
  html?: string | null;
  text?: string | null;
  headers?: ReceivedEmailHeader[] | Record<string, ReceivedEmailHeaderMapValue> | null;
};

type EmailAddressLike =
  | string
  | {
      email?: string;
      address?: string;
      value?: string;
      original?: string;
    };

type EmailReceivedEventData = {
  email_id?: string;
  from?: EmailAddressLike;
  to?: EmailAddressLike | EmailAddressLike[];
  cc?: EmailAddressLike | EmailAddressLike[];
  bcc?: EmailAddressLike | EmailAddressLike[];
  message_id?: string;
  subject?: string;
  created_at?: string;
  attachments?: Array<Record<string, unknown>>;
} & Record<string, unknown>;

type HandleInboundEmailResult =
  | {
      ok: true;
      ignored: false;
      threadId: string;
      messageEntryId: string;
    }
  | {
      ok: true;
      ignored: true;
      reason: string;
    };

function normaliseEmailAddress(input: string | null | undefined): string | null {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();

  if (!candidate.includes("@")) {
    return null;
  }

  return candidate;
}

function normaliseEmailAddressList(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.flatMap((item) => normaliseEmailAddressList(item));
  }

  if (typeof input === "string") {
    return input
      .split(",")
      .map((part) => normaliseEmailAddress(part))
      .filter((value): value is string => Boolean(value));
  }

  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    const candidate =
      typeof record.email === "string"
        ? record.email
        : typeof record.address === "string"
          ? record.address
          : typeof record.value === "string"
            ? record.value
            : typeof record.original === "string"
              ? record.original
              : null;

    return candidate ? normaliseEmailAddressList(candidate) : [];
  }

  return [];
}

function normaliseReceivedHeaders(
  headers: ReceivedEmailContent["headers"],
): ReceivedEmailHeader[] {
  if (!headers) return [];

  if (Array.isArray(headers)) {
    return headers;
  }

  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: Array.isArray(value)
      ? value
          .filter((item) => item !== null && item !== undefined)
          .map((item) => String(item))
          .join(", ")
      : value === null || value === undefined
        ? ""
        : String(value),
  }));
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_match, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : "";
    });
}

function htmlToPlainText(html: string | null | undefined) {
  if (!html?.trim()) return "";

  return decodeBasicHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripQuotedEmailContent(value: string) {
  let output = decodeBasicHtmlEntities(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  const cutPatterns = [
    /\n\s*On\s.+?wrote:\s*/is,
    /\n\s*From:\s.+/is,
    /\n\s*Sent from my iPhone\s+On\s.+?wrote:\s*/is,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/is,
    /\n\s*_{5,}\s*$/is,
  ];

  for (const pattern of cutPatterns) {
    const match = output.match(pattern);
    if (match?.index && match.index > 0) {
      output = output.slice(0, match.index).trim();
    }
  }

  output = output
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .replace(/SIXFL\s+html,\s*body\s*\{[\s\S]*$/i, "")
    .replace(/html,\s*body\s*\{[\s\S]*$/i, "")
    .replace(/\.sixfl-[\s\S]*$/i, "")
    .replace(/\{\s*margin:\s*0px\s*!important;[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return output;
}

function getCleanInboundBody(input: {
  text?: string | null;
  html?: string | null;
  subject?: string | null;
}) {
  const textCandidate = stripQuotedEmailContent(input.text ?? "");
  if (textCandidate) return textCandidate;

  const htmlCandidate = stripQuotedEmailContent(htmlToPlainText(input.html));
  if (htmlCandidate) return htmlCandidate;

  return input.subject?.trim() || "";
}

function buildLastMessagePreview(input: {
  subject?: string | null;
  text?: string | null;
  html?: string | null;
}): string {
  const subject = input.subject?.trim();
  const text = stripQuotedEmailContent(input.text ?? "");
  const html = stripQuotedEmailContent(htmlToPlainText(input.html));

  const base = text || html || subject || "";

  if (!base) return "";

  return base.length > 140 ? `${base.slice(0, 137)}...` : base;
}

function getHeaderValue(
  headers: ReceivedEmailContent["headers"],
  name: string,
): string | null {
  const normalisedHeaders = normaliseReceivedHeaders(headers);

  const match = normalisedHeaders.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );

  return match?.value?.trim() || null;
}

function getEventData(event: ResendWebhookEvent): EmailReceivedEventData | null {
  if (event.type !== "email.received") {
    return null;
  }

  if (!event.data || typeof event.data !== "object") {
    return null;
  }

  return event.data as EmailReceivedEventData;
}

function pickManagedReplyAddress(addresses: unknown): string | null {
  const normalisedAddresses = normaliseEmailAddressList(addresses);

  for (const address of normalisedAddresses) {
    const parsed = parseThreadReplyAddress(address);
    if (parsed?.threadId) {
      return parsed.normalized;
    }
  }

  return null;
}

async function fetchReceivedEmailContent(
  emailId: string,
): Promise<ReceivedEmailContent> {
  const resend = getResendClient();
  const response = await resend.emails.receiving.get(emailId);

  if (response.error) {
    throw new Error(
      response.error.message || "Failed to retrieve inbound email content.",
    );
  }

  return (response.data ?? {}) as ReceivedEmailContent;
}

async function updateThreadSummary(threadId: string) {
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
      latestMessageAt:
        latestMessage?.receivedAt ??
        latestMessage?.sentAt ??
        latestMessage?.createdAt ??
        null,
      latestInboundAt:
        latestInbound?.receivedAt ?? latestInbound?.createdAt ?? null,
      latestOutboundAt:
        latestOutbound?.sentAt ?? latestOutbound?.createdAt ?? null,
      lastInboundMessageId: latestInbound?.id ?? null,
      lastOutboundMessageId: latestOutbound?.id ?? null,
      lastMessagePreview: latestMessage
        ? buildLastMessagePreview({
            subject: latestMessage.subject,
            text: latestMessage.textBody ?? latestMessage.body,
            html: latestMessage.htmlBody,
          })
        : null,
      unreadForAdminCount: unreadInboundCount,
    },
  });
}

async function createInboxAlert(messageId: string, threadId: string) {
  const existing = await prisma.inboxAlert.findUnique({
    where: { messageId },
  });

  if (existing) {
    return existing;
  }

  return prisma.inboxAlert.create({
    data: {
      messageId,
      threadId,
      type: "NEW_INBOUND_EMAIL",
      status: "PENDING",
    },
  });
}

export async function handleInboundEmailWebhook(
  event: ResendWebhookEvent,
): Promise<HandleInboundEmailResult> {
  const data = getEventData(event);

  if (!data) {
    return {
      ok: true,
      ignored: true,
      reason: "unsupported_event",
    };
  }

  const emailId = data.email_id?.trim();
  if (!emailId) {
    return {
      ok: true,
      ignored: true,
      reason: "missing_email_id",
    };
  }

  const replyAddress = pickManagedReplyAddress(data.to);
  const threadIdFromAddress = extractThreadIdFromReplyAddress(replyAddress);

  if (!threadIdFromAddress) {
    return {
      ok: true,
      ignored: true,
      reason: "missing_thread_reply_address",
    };
  }

  const thread = await prisma.messageThread.findUnique({
    where: {
      id: threadIdFromAddress,
    },
    include: {
      recipient: true,
    },
  });

  if (!thread) {
    return {
      ok: true,
      ignored: true,
      reason: "thread_not_found",
    };
  }

  const existingMessage = await prisma.messageEntry.findFirst({
    where: {
      OR: [
        { providerMessageId: emailId },
        data.message_id
          ? { internetMessageId: data.message_id }
          : undefined,
      ].filter(Boolean) as Prisma.MessageEntryWhereInput[],
    },
    select: {
      id: true,
      threadId: true,
    },
  });

  if (existingMessage) {
    return {
      ok: true,
      ignored: false,
      threadId: existingMessage.threadId,
      messageEntryId: existingMessage.id,
    };
  }

  const email = await fetchReceivedEmailContent(emailId);

  const fromEmail = normaliseEmailAddressList(data.from)[0] ?? null;
  const toEmail = replyAddress;
  const rawTextBody = email.text?.trim() || null;
  const rawHtmlBody = email.html?.trim() || null;
  const subject = data.subject?.trim() || null;
  const body = getCleanInboundBody({
    text: rawTextBody,
    html: rawHtmlBody,
    subject,
  });
  const textBody = body || rawTextBody;
  const htmlBody = rawHtmlBody;

  const createdMessage = await prisma.messageEntry.create({
    data: {
      threadId: thread.id,
      channel: "EMAIL",
      direction: "INBOUND",
      participantRole: "CONTACT",
      body,
      subject,
      textBody,
      htmlBody,
      fromEmail,
      toEmail,
      provider: "resend",
      providerMessageId: emailId,
      providerStatus: "received",
      receivedAt: new Date(),
      internetMessageId:
        data.message_id?.trim() || getHeaderValue(email.headers, "message-id"),
      inReplyTo: getHeaderValue(email.headers, "in-reply-to"),
      referencesHeader: getHeaderValue(email.headers, "references"),
      resendEmailId: emailId,
    },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: {
      channel: "EMAIL",
      contactEmail: thread.contactEmail ?? fromEmail,
      emailNormalized: thread.emailNormalized ?? fromEmail,
      replyAddress: thread.replyAddress ?? replyAddress,
    },
  });

  await createInboxAlert(createdMessage.id, thread.id);
  await updateThreadSummary(thread.id);

  return {
    ok: true,
    ignored: false,
    threadId: thread.id,
    messageEntryId: createdMessage.id,
  };
}
