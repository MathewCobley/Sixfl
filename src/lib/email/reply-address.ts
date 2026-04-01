// ========================================
// File: src/lib/email/reply-address.ts
// ========================================

const THREAD_REPLY_PREFIX = "thread";

type ParsedReplyAddress = {
  original: string;
  normalized: string;
  localPart: string;
  domain: string;
  threadId: string | null;
};

function getConfiguredReplyDomain(): string {
  const value = process.env.EMAIL_REPLY_DOMAIN?.trim().toLowerCase();

  if (!value) {
    throw new Error("Missing EMAIL_REPLY_DOMAIN.");
  }

  return value;
}

function extractEmailAddress(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();

  if (!candidate.includes("@")) {
    return null;
  }

  return candidate;
}

function splitEmailAddress(address: string): {
  localPart: string;
  domain: string;
} | null {
  const atIndex = address.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === address.length - 1) {
    return null;
  }

  return {
    localPart: address.slice(0, atIndex),
    domain: address.slice(atIndex + 1),
  };
}

function isSafeThreadId(threadId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(threadId);
}

export function buildThreadReplyAddress(threadId: string): string {
  const trimmedThreadId = threadId.trim();

  if (!trimmedThreadId) {
    throw new Error("Cannot build reply address without a thread ID.");
  }

  if (!isSafeThreadId(trimmedThreadId)) {
    throw new Error(
      "Thread reply addresses only support letters, numbers, hyphens, and underscores.",
    );
  }

  return `${THREAD_REPLY_PREFIX}-${trimmedThreadId}@${getConfiguredReplyDomain()}`;
}

export function parseThreadReplyAddress(
  input: string | null | undefined,
): ParsedReplyAddress | null {
  if (!input) return null;

  const normalized = extractEmailAddress(input);
  if (!normalized) return null;

  const parts = splitEmailAddress(normalized);
  if (!parts) return null;

  const prefix = `${THREAD_REPLY_PREFIX}-`;
  const threadId = parts.localPart.startsWith(prefix)
    ? parts.localPart.slice(prefix.length)
    : null;

  return {
    original: input,
    normalized,
    localPart: parts.localPart,
    domain: parts.domain,
    threadId: threadId && isSafeThreadId(threadId) ? threadId : null,
  };
}

export function isManagedReplyAddress(
  input: string | null | undefined,
): boolean {
  const parsed = parseThreadReplyAddress(input);
  if (!parsed) return false;

  return parsed.domain === getConfiguredReplyDomain();
}

export function extractThreadIdFromReplyAddress(
  input: string | null | undefined,
): string | null {
  const parsed = parseThreadReplyAddress(input);
  if (!parsed) return null;

  if (parsed.domain !== getConfiguredReplyDomain()) {
    return null;
  }

  return parsed.threadId;
}
