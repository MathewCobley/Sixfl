// ========================================
// File: src/components/admin/messages/AdminMessageThread.tsx
// ========================================

"use client";

import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo } from "react";
import { useFormStatus } from "react-dom";
import {
  archiveMessageThreadAction,
  markMessageThreadReadAction,
  reopenMessageThreadAction,
  sendAdminMessageReplyAction,
} from "@/app/(admin)/admin/messages/actions";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const TRAILING_URL_PUNCTUATION_REGEX = /[),.!?]+$/;

type SelectedThread = {
  id: string;
  channel: "SMS" | "EMAIL";
  status: "OPEN" | "ARCHIVED" | "CLOSED";
  contactName: string | null;
  contactPhone: string | null;
  phoneNormalized: string | null;
  contactEmail: string | null;
  emailNormalized: string | null;
  replyAddress: string | null;
  unreadForAdminCount: number;
  latestMessageAt: string | null;
  latestInboundAt: string | null;
  latestOutboundAt: string | null;
  team: {
    id: string;
    name: string;
    logoUrl: string | null;
  } | null;
  league: {
    id: string;
    name: string;
    season: string | null;
    slug: string;
  } | null;
  recipient: {
    id: string;
    displayName: string | null;
    phone: string | null;
    email: string | null;
    audience: string;
    sourceType: string;
  } | null;
  messages: Array<{
    id: string;
    channel: "SMS" | "EMAIL";
    direction: "INBOUND" | "OUTBOUND";
    participantRole: "ADMIN" | "CAPTAIN" | "CONTACT" | "SYSTEM";
    body: string;
    htmlBody: string | null;
    subject: string | null;
    fromNumber: string | null;
    toNumber: string | null;
    fromEmail: string | null;
    toEmail: string | null;
    providerStatus: string | null;
    sentAt: string | null;
    receivedAt: string | null;
    readAt: string | null;
    createdAt: string;
    dispatch?: {
      id: string;
      template: {
        id: string;
        name: string;
        key: string;
      } | null;
      metadata: unknown;
    } | null;
  }>;
} | null;

type AdminMessageThreadProps = {
  selectedFilter: "unread" | "open" | "archived" | "all";
  thread: SelectedThread;
};

type NoticeTone = "success" | "error" | "info";

type Notice = {
  tone: NoticeTone;
  message: string;
};

function splitTrailingUrlPunctuation(url: string): {
  href: string;
  trailing: string;
} {
  const match = url.match(TRAILING_URL_PUNCTUATION_REGEX);
  const trailing = match?.[0] ?? "";
  const href = trailing ? url.slice(0, -trailing.length) : url;

  return {
    href,
    trailing,
  };
}

function renderLinkedText(body: string, linkClassName: string) {
  return body.split(URL_REGEX).map((part, index) => {
    if (part.startsWith("http://") || part.startsWith("https://")) {
      const { href, trailing } = splitTrailingUrlPunctuation(part);

      if (!href) {
        return <Fragment key={`text-${index}`}>{part}</Fragment>;
      }

      return (
        <Fragment key={`link-${index}`}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          >
            {href}
          </a>
          {trailing}
        </Fragment>
      );
    }

    return <Fragment key={`text-${index}`}>{part}</Fragment>;
  });
}

function PlainTextBody({
  body,
  className,
  linkClassName,
}: {
  body: string;
  className: string;
  linkClassName: string;
}) {
  return (
    <div className={className}>
      {renderLinkedText(body, linkClassName)}
    </div>
  );
}

function SmsTranscriptPreview({ body }: { body: string }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40 px-4 py-4 sm:px-5">
      <PlainTextBody
        body={body}
        className="whitespace-pre-wrap break-words text-[15px] leading-7 text-white"
        linkClassName="font-medium text-white underline underline-offset-4 transition hover:opacity-80"
      />
    </div>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPhone(value: string | null): string {
  if (!value) return "—";

  if (value.startsWith("+44") && value.length === 13) {
    const local = `0${value.slice(3)}`;
    return `${local.slice(0, 5)} ${local.slice(5, 8)} ${local.slice(8)}`;
  }

  return value;
}

function getThreadTitle(thread: NonNullable<SelectedThread>): string {
  return (
    thread.team?.name ||
    thread.contactName ||
    thread.contactEmail ||
    thread.recipient?.displayName ||
    thread.recipient?.email ||
    thread.contactPhone ||
    thread.phoneNormalized ||
    "Unknown contact"
  );
}

function getAudienceLabel(thread: NonNullable<SelectedThread>): string {
  if (thread.team) {
    return thread.channel === "EMAIL" ? "Team email thread" : "Team SMS thread";
  }

  if (thread.recipient?.audience) {
    return `${thread.recipient.audience} ${
      thread.channel === "EMAIL" ? "email" : "SMS"
    } contact`;
  }

  return thread.channel === "EMAIL"
    ? "General email contact"
    : "General SMS contact";
}

function getStatusTone(status: NonNullable<SelectedThread>["status"]): string {
  switch (status) {
    case "ARCHIVED":
      return "bg-white/10 text-white/60 border-white/10";
    case "CLOSED":
      return "bg-amber-400/10 text-amber-200 border-amber-400/20";
    default:
      return "bg-emerald-400/10 text-emerald-300 border-emerald-400/20";
  }
}

function getMessageMeta(
  message: NonNullable<SelectedThread>["messages"][number],
): string {
  if (message.direction === "INBOUND") {
    return `Received ${formatDateTime(message.receivedAt || message.createdAt)}`;
  }

  return `Sent ${formatDateTime(message.sentAt || message.createdAt)}`;
}

function getMessageRoleLabel(
  message: NonNullable<SelectedThread>["messages"][number],
): string {
  if (message.direction === "INBOUND") {
    return "Contact";
  }

  switch (message.participantRole) {
    case "ADMIN":
      return "SIXFL admin";
    case "CAPTAIN":
      return "Captain";
    case "SYSTEM":
      return "Automated";
    default:
      return "SIXFL";
  }
}

function getMessageSourceLabel(
  message: NonNullable<SelectedThread>["messages"][number],
) {
  if (message.direction === "INBOUND") {
    return null;
  }

  if (message.dispatch?.template) {
    return {
      label: `Template: ${message.dispatch.template.name}`,
      key: message.dispatch.template.key,
    };
  }

  if (message.channel === "EMAIL") {
    return {
      label: "Manual email",
      key: null,
    };
  }

  if (message.channel === "SMS") {
    return {
      label: "Manual SMS",
      key: null,
    };
  }

  return null;
}

function getNotice(
  searchParams: ReturnType<typeof useSearchParams>,
): Notice | null {
  const error = searchParams.get("error");

  if (error) {
    switch (error) {
      case "missing_thread":
        return {
          tone: "error",
          message: "That conversation could not be found.",
        };
      case "empty_body":
        return {
          tone: "error",
          message: "Type a reply before sending.",
        };
      case "missing_phone":
        return {
          tone: "error",
          message: "This thread does not have a valid phone number.",
        };
      case "thread_not_open":
        return {
          tone: "error",
          message: "Reopen the thread before sending a new reply.",
        };
      case "send_failed":
        return {
          tone: "error",
          message:
            "The SMS reply could not be sent. Check Twilio settings and try again.",
        };
      default:
        return {
          tone: "error",
          message: "Something went wrong. Please try again.",
        };
    }
  }

  if (searchParams.get("sent") === "1") {
    return {
      tone: "success",
      message: "SMS reply sent successfully.",
    };
  }

  if (searchParams.get("archived") === "1") {
    return {
      tone: "success",
      message: "Thread archived.",
    };
  }

  if (searchParams.get("reopened") === "1") {
    return {
      tone: "success",
      message: "Thread reopened.",
    };
  }

  if (searchParams.get("read") === "1") {
    return {
      tone: "success",
      message: "Thread marked as read.",
    };
  }

  return null;
}

function NoticeBanner({ notice }: { notice: Notice }) {
  const toneClass =
    notice.tone === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-100"
      : notice.tone === "info"
        ? "border-white/10 bg-white/[0.04] text-white/80"
        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      {notice.message}
    </div>
  );
}

function ActionButton({
  label,
  pendingLabel,
  disabled = false,
  className,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function AdminMessageThread({
  selectedFilter,
  thread,
}: AdminMessageThreadProps) {
  const searchParams = useSearchParams();
  const notice = getNotice(searchParams);

  if (!thread) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <div className="flex min-h-[500px] items-center justify-center">
          <div className="max-w-md text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-2xl">
              💬
            </div>
            <h3 className="mt-5 text-xl font-semibold text-white">
              No thread selected
            </h3>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Choose a conversation from the inbox to view the full message
              timeline, contact details, and unread reply status.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const title = getThreadTitle(thread);
  const replyPhoneRaw =
    thread.phoneNormalized || thread.recipient?.phone || thread.contactPhone;
  const replyPhoneLabel = formatPhone(replyPhoneRaw);
  const replyEmail =
    thread.contactEmail ||
    thread.recipient?.email ||
    thread.emailNormalized ||
    thread.replyAddress;
  const canSmsReply = Boolean(replyPhoneRaw) && thread.status === "OPEN";

  const replyPanelTitle = canSmsReply
    ? "Reply by SMS"
    : thread.channel === "SMS"
      ? "Reply by SMS"
      : "Email replies";

  const replyHelpText = canSmsReply
    ? `Replying by SMS to ${replyPhoneLabel}. This keeps the full mixed conversation timeline together.`
    : !replyPhoneRaw
      ? "This thread has no valid phone number yet, so SMS reply is unavailable."
      : thread.status !== "OPEN"
        ? "Reopen this thread before sending a new SMS reply."
        : "This thread cannot be replied to from the admin inbox right now.";

  const orderedMessages = useMemo(
    () =>
      [...thread.messages].sort(
        (a, b) =>
          new Date(b.receivedAt || b.sentAt || b.createdAt).getTime() -
          new Date(a.receivedAt || a.sentAt || a.createdAt).getTime(),
      ),
    [thread.messages],
  );

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="border-b border-white/10 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">
              {thread.team?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thread.team.logoUrl}
                  alt={thread.team.name}
                  className="h-full w-full rounded-3xl object-cover"
                />
              ) : (
                <span>{title.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
                  {thread.channel}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getStatusTone(
                    thread.status,
                  )}`}
                >
                  {thread.status}
                </span>

                {thread.unreadForAdminCount > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-black">
                    {thread.unreadForAdminCount} unread
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                    Reviewed
                  </span>
                )}
              </div>

              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">
                  {title}
                </h2>
                <p className="mt-2 text-sm text-white/55">
                  {getAudienceLabel(thread)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-white/45">
                {replyPhoneRaw ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    SMS: {replyPhoneLabel}
                  </span>
                ) : null}

                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Email: {replyEmail || "—"}
                </span>

                {thread.replyAddress ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    Reply-to: {thread.replyAddress}
                  </span>
                ) : null}

                {thread.league ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    League:{" "}
                    {thread.league.season
                      ? `${thread.league.name} · ${thread.league.season}`
                      : thread.league.name}
                  </span>
                ) : null}

                {thread.recipient?.sourceType ? (
                  <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                    Source: {thread.recipient.sourceType}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[440px]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Latest activity
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {formatDateTime(thread.latestMessageAt)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Latest inbound
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {formatDateTime(thread.latestInboundAt)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Latest outbound
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {formatDateTime(thread.latestOutboundAt)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Thread actions
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={markMessageThreadReadAction}>
                  <input type="hidden" name="threadId" value={thread.id} />
                  <input type="hidden" name="filter" value={selectedFilter} />
                  <ActionButton
                    label={
                      thread.unreadForAdminCount > 0
                        ? `Mark read (${thread.unreadForAdminCount})`
                        : "Already read"
                    }
                    pendingLabel="Updating..."
                    disabled={thread.unreadForAdminCount === 0}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
                  />
                </form>

                {thread.status === "OPEN" ? (
                  <form action={archiveMessageThreadAction}>
                    <input type="hidden" name="threadId" value={thread.id} />
                    <ActionButton
                      label="Archive"
                      pendingLabel="Archiving..."
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </form>
                ) : (
                  <form action={reopenMessageThreadAction}>
                    <input type="hidden" name="threadId" value={thread.id} />
                    <ActionButton
                      label="Reopen"
                      pendingLabel="Reopening..."
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </form>
                )}

                <Link
                  href={`${ADMIN_MESSAGES_BASE_PATH}?filter=${selectedFilter}&thread=${thread.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  Refresh
                </Link>

                {thread.team ? (
                  <Link
                    href={`/admin/teams/${thread.team.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white transition hover:bg-white/[0.08]"
                  >
                    Open team
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {notice ? (
          <div className="mt-5">
            <NoticeBanner notice={notice} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 p-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">
                Conversation timeline
              </h3>
              <p className="mt-1 text-sm text-white/50">
                Newest messages first across SMS and email.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/55">
              {orderedMessages.length} messages
            </div>
          </div>

          {orderedMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-white/55">
              No messages have been saved to this thread yet.
            </div>
          ) : (
            <div className="space-y-4">
              {orderedMessages.map((message) => {
                const isInbound = message.direction === "INBOUND";
                const isHtmlEmailPreview =
                  message.direction === "OUTBOUND" &&
                  message.channel === "EMAIL" &&
                  Boolean(message.htmlBody);
                const isSmsPreview = message.channel === "SMS";
                const sourceLabel = getMessageSourceLabel(message);

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isInbound ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-3xl border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.2)]",
                        isInbound
                          ? "border-white/10 bg-white/[0.05] text-white"
                          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-50",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                        <span
                          className={
                            isInbound ? "text-white/45" : "text-emerald-200/80"
                          }
                        >
                          {getMessageRoleLabel(message)}
                        </span>

                        <span
                          className={
                            isInbound ? "text-white/25" : "text-emerald-200/50"
                          }
                        >
                          •
                        </span>

                        <span
                          className={
                            isInbound ? "text-white/45" : "text-emerald-200/80"
                          }
                        >
                          {message.channel}
                        </span>

                        <span
                          className={
                            isInbound ? "text-white/25" : "text-emerald-200/50"
                          }
                        >
                          •
                        </span>

                        <span
                          className={
                            isInbound ? "text-white/45" : "text-emerald-200/80"
                          }
                        >
                          {getMessageMeta(message)}
                        </span>

                        {sourceLabel ? (
                          <>
                            <span
                              className={
                                isInbound
                                  ? "text-white/25"
                                  : "text-emerald-200/50"
                              }
                            >
                              •
                            </span>
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 normal-case tracking-normal text-emerald-100">
                              {sourceLabel.label}
                            </span>
                            {sourceLabel.key ? (
                              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono normal-case tracking-normal text-white/60">
                                {sourceLabel.key}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>

                      {message.subject ? (
                        <div className="mb-3 text-sm font-semibold text-white/90">
                          {message.subject}
                        </div>
                      ) : null}

                      {isHtmlEmailPreview ? (
                        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                          <EmailHtmlPreview html={message.htmlBody ?? ""} />
                        </div>
                      ) : isSmsPreview ? (
                        <SmsTranscriptPreview body={message.body} />
                      ) : (
                        <PlainTextBody
                          body={message.body}
                          className="whitespace-pre-wrap break-words text-sm leading-6"
                          linkClassName={
                            isInbound
                              ? "font-medium text-white underline underline-offset-4 transition hover:opacity-80"
                              : "font-medium text-emerald-50 underline underline-offset-4 transition hover:opacity-80"
                          }
                        />
                      )}

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        {message.fromNumber ? (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isInbound
                                ? "bg-black/20 text-white/45"
                                : "bg-emerald-950/40 text-emerald-100/80"
                            }`}
                          >
                            From: {formatPhone(message.fromNumber)}
                          </span>
                        ) : null}

                        {message.toNumber ? (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isInbound
                                ? "bg-black/20 text-white/45"
                                : "bg-emerald-950/40 text-emerald-100/80"
                            }`}
                          >
                            To: {formatPhone(message.toNumber)}
                          </span>
                        ) : null}

                        {message.fromEmail ? (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isInbound
                                ? "bg-black/20 text-white/45"
                                : "bg-emerald-950/40 text-emerald-100/80"
                            }`}
                          >
                            From: {message.fromEmail}
                          </span>
                        ) : null}

                        {message.toEmail ? (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isInbound
                                ? "bg-black/20 text-white/45"
                                : "bg-emerald-950/40 text-emerald-100/80"
                            }`}
                          >
                            To: {message.toEmail}
                          </span>
                        ) : null}

                        {message.providerStatus ? (
                          <span
                            className={`rounded-full px-2 py-1 ${
                              isInbound
                                ? "bg-black/20 text-white/45"
                                : "bg-emerald-950/40 text-emerald-100/80"
                            }`}
                          >
                            Status: {message.providerStatus}
                          </span>
                        ) : null}

                        {message.readAt && isInbound ? (
                          <span className="rounded-full bg-black/20 px-2 py-1 text-white/45">
                            Read: {formatDateTime(message.readAt)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h3 className="text-lg font-semibold text-white">
              {replyPanelTitle}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/55">
              {canSmsReply
                ? "Send a direct SMS reply from the inbox and keep the full mixed conversation timeline together."
                : "Incoming replies appear here and are grouped across SMS and email."}
            </p>

            <form action={sendAdminMessageReplyAction} className="mt-4 space-y-4">
              <input type="hidden" name="threadId" value={thread.id} />
              <input type="hidden" name="filter" value={selectedFilter} />

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                {replyHelpText}
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  SMS reply
                </label>
                <textarea
                  name="body"
                  rows={5}
                  disabled={!canSmsReply}
                  placeholder={
                    canSmsReply
                      ? "Type your SMS reply here..."
                      : "SMS reply unavailable for this thread"
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40 focus:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <ActionButton
                label="Send SMS reply"
                pendingLabel="Sending reply..."
                disabled={!canSmsReply}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
              />
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h3 className="text-lg font-semibold text-white">Contact details</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Display name
                </div>
                <div className="mt-1 text-white/80">
                  {thread.contactName || thread.recipient?.displayName || title}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Email
                </div>
                <div className="mt-1 text-white/80">
                  {thread.contactEmail ||
                    thread.recipient?.email ||
                    thread.emailNormalized ||
                    "—"}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Phone
                </div>
                <div className="mt-1 text-white/80">
                  {formatPhone(
                    thread.contactPhone ||
                      thread.recipient?.phone ||
                      thread.phoneNormalized,
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Audience
                </div>
                <div className="mt-1 text-white/80">
                  {thread.recipient?.audience || "—"}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Source type
                </div>
                <div className="mt-1 text-white/80">
                  {thread.recipient?.sourceType || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
            <h3 className="text-lg font-semibold text-white">Linked records</h3>

            <div className="mt-4 space-y-3">
              {thread.team ? (
                <Link
                  href={`/admin/teams/${thread.team.id}`}
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Team
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {thread.team.name}
                  </div>
                </Link>
              ) : null}

              {thread.league ? (
                <Link
                  href={`/leagues/${thread.league.slug}`}
                  className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    League
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {thread.league.season
                      ? `${thread.league.name} · ${thread.league.season}`
                      : thread.league.name}
                  </div>
                </Link>
              ) : null}

              {!thread.team && !thread.league ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/50">
                  No linked team or league yet for this thread.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}