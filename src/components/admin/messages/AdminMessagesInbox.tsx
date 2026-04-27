// ========================================
// File: src/components/admin/messages/AdminMessagesInbox.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo } from "react";
import AdminMessageThread from "@/components/admin/messages/AdminMessageThread";
import CancelQueuedSmsButton from "@/components/admin/messages/CancelQueuedSmsButton";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";

type InboxLeague = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
};

type InboxTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
  teamMode?: "STANDARD" | "MANAGED";
};

type InboxThreadListItem = {
  id: string;
  channel: "SMS" | "EMAIL";
  status: "OPEN" | "ARCHIVED" | "CLOSED";
  contactName: string | null;
  contactPhone: string | null;
  phoneNormalized: string | null;
  contactEmail: string | null;
  emailNormalized: string | null;
  replyAddress: string | null;
  lastMessagePreview: string | null;
  unreadForAdminCount: number;
  latestMessageAt: string | null;
  latestInboundAt: string | null;
  latestOutboundAt: string | null;
  team: InboxTeam | null;
  league: {
    id: string;
    name: string;
    season: string | null;
    slug: string;
  } | null;
  latestMessage: {
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    body: string;
    createdAt: string;
  } | null;
};

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
  team: InboxTeam | null;
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

type AdminMessagesInboxProps = {
  threads: InboxThreadListItem[];
  selectedFilter: "unread" | "open" | "archived" | "all";
  selectedThreadId: string | null;
  selectedThread: SelectedThread;
  leagues: InboxLeague[];
};

function formatDateTime(value: string | null): string {
  if (!value) return "No activity yet";

  const date = new Date(value);

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatPhone(value: string | null): string {
  if (!value) return "No phone";

  if (value.startsWith("+44") && value.length === 13) {
    const local = `0${value.slice(3)}`;
    return `${local.slice(0, 5)} ${local.slice(5, 8)} ${local.slice(8)}`;
  }

  return value;
}

function getPrimaryContactLabel(thread: InboxThreadListItem): string | null {
  if (thread.contactName?.trim()) return thread.contactName.trim();
  if (thread.channel === "EMAIL") {
    return thread.contactEmail || thread.emailNormalized || null;
  }

  if (thread.contactPhone) return formatPhone(thread.contactPhone);
  return thread.phoneNormalized || null;
}

function getThreadTitle(thread: InboxThreadListItem): string {
  const isManagedTeam = thread.team?.teamMode === "MANAGED";
  const primaryContact = getPrimaryContactLabel(thread);

  if (isManagedTeam) {
    return primaryContact || thread.team?.name || "Unknown contact";
  }

  return (
    thread.team?.name ||
    primaryContact ||
    thread.contactEmail ||
    thread.emailNormalized ||
    thread.contactPhone ||
    thread.phoneNormalized ||
    "Unknown contact"
  );
}

function getThreadSubtitle(thread: InboxThreadListItem): string {
  const isManagedTeam = thread.team?.teamMode === "MANAGED";
  const primaryContact = getPrimaryContactLabel(thread);
  const leagueLabel = thread.league
    ? thread.league.season
      ? `${thread.league.name} · ${thread.league.season}`
      : thread.league.name
    : null;

  if (isManagedTeam && thread.team) {
    return [
      `Managed team: ${thread.team.name}`,
      leagueLabel,
      primaryContact && primaryContact !== getThreadTitle(thread)
        ? primaryContact
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const parts = [leagueLabel, primaryContact].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return thread.channel === "EMAIL" ? "General email contact" : "General SMS contact";
}

function getAvatarLabel(thread: InboxThreadListItem): string {
  const isManagedTeam = thread.team?.teamMode === "MANAGED";
  const label = isManagedTeam
    ? getPrimaryContactLabel(thread) || thread.team?.name
    : thread.team?.name || getPrimaryContactLabel(thread) || thread.contactEmail;

  return (label || "M").slice(0, 2).toUpperCase();
}

function getStatusLabel(status: InboxThreadListItem["status"]): string {
  switch (status) {
    case "ARCHIVED":
      return "Archived";
    case "CLOSED":
      return "Closed";
    default:
      return "Open";
  }
}

function getFilterHref(filter: AdminMessagesInboxProps["selectedFilter"]): string {
  return `${ADMIN_MESSAGES_BASE_PATH}?filter=${filter}`;
}

function isQueuedSms(message: NonNullable<SelectedThread>["messages"][number]) {
  return (
    message.channel === "SMS" &&
    message.direction === "OUTBOUND" &&
    Boolean(message.dispatch?.id) &&
    Boolean(message.providerStatus?.trim().toUpperCase().startsWith("QUEUED"))
  );
}

export default function AdminMessagesInbox({
  threads,
  selectedFilter,
  selectedThreadId,
  selectedThread,
  leagues,
}: AdminMessagesInboxProps) {
  const filterItems = useMemo(
    () => [
      {
        key: "unread" as const,
        label: "Unread",
        count: threads.filter((thread) => thread.unreadForAdminCount > 0).length,
      },
      {
        key: "open" as const,
        label: "Open",
        count: threads.filter((thread) => thread.status === "OPEN").length,
      },
      {
        key: "archived" as const,
        label: "Archived",
        count: threads.filter((thread) => thread.status === "ARCHIVED").length,
      },
      {
        key: "all" as const,
        label: "All",
        count: threads.length,
      },
    ],
    [threads],
  );

  const queuedSmsMessages = useMemo(() => {
    if (!selectedThread) return [];

    return selectedThread.messages
      .filter(isQueuedSms)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [selectedThread]);

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="border-b border-white/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Inbox
              </div>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Team conversations
              </h2>
              <p className="mt-2 text-sm text-white/55">
                Replies are grouped into threads so you can track each team and
                contact properly across SMS and email.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                Leagues
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {leagues.length}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {filterItems.map((item) => {
              const active = selectedFilter === item.key;

              return (
                <Link
                  key={item.key}
                  href={getFilterHref(item.key)}
                  className={[
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                    active
                      ? "border-emerald-400/30 bg-emerald-400/12 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white",
                  ].join(" ")}
                >
                  <span>{item.label}</span>
                  <span
                    className={[
                      "inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px]",
                      active
                        ? "bg-emerald-400/20 text-emerald-200"
                        : "bg-white/10 text-white/60",
                    ].join(" ")}
                  >
                    {item.count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-3">
          {threads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
              No message threads yet. Once replies arrive from SMS or email, they
              will appear here.
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => {
                const isSelected = selectedThreadId === thread.id;
                const isManagedTeam = thread.team?.teamMode === "MANAGED";

                return (
                  <Link
                    key={thread.id}
                    href={`${ADMIN_MESSAGES_BASE_PATH}?filter=${selectedFilter}&thread=${thread.id}`}
                    className={[
                      "block rounded-[1.5rem] border p-4 transition",
                      isSelected
                        ? "border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                        : "border-white/10 bg-black/20 hover:border-white/15 hover:bg-white/[0.04]",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">
                        {thread.team?.logoUrl && !isManagedTeam ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thread.team.logoUrl}
                            alt={thread.team.name}
                            className="h-full w-full rounded-2xl object-cover"
                          />
                        ) : (
                          <span>{getAvatarLabel(thread)}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="truncate text-sm font-semibold text-white">
                                {getThreadTitle(thread)}
                              </div>
                              {isManagedTeam ? (
                                <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                                  Managed
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-white/45">
                              {getThreadSubtitle(thread)}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
                                {thread.channel}
                              </span>
                              <span
                                className={[
                                  "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                  thread.status === "ARCHIVED"
                                    ? "bg-white/10 text-white/55"
                                    : "bg-emerald-400/15 text-emerald-300",
                                ].join(" ")}
                              >
                                {getStatusLabel(thread.status)}
                              </span>
                            </div>

                            {thread.unreadForAdminCount > 0 ? (
                              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-emerald-400 px-2 py-1 text-[11px] font-bold text-black">
                                {thread.unreadForAdminCount}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 line-clamp-2 text-sm leading-6 text-white/65">
                          {thread.lastMessagePreview || "No preview available yet."}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/40">
                          <span>
                            {thread.latestMessage?.direction === "INBOUND"
                              ? "Latest: inbound"
                              : "Latest: outbound"}
                          </span>
                          <span>{formatDateTime(thread.latestMessageAt)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {selectedThread && queuedSmsMessages.length > 0 ? (
          <div className="rounded-[1.5rem] border border-amber-400/25 bg-amber-500/10 p-4 text-amber-50 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/75">
                  Queued SMS in this thread
                </div>
                <div className="mt-1 text-sm text-amber-100/85">
                  These SMS messages have not been sent yet. Cancel them here before the notification worker processes them.
                </div>
              </div>
              <span className="inline-flex w-fit rounded-full border border-amber-400/25 bg-black/20 px-3 py-1 text-xs font-semibold text-amber-100">
                {queuedSmsMessages.length} queued
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {queuedSmsMessages.map((message) => (
                <div
                  key={message.id}
                  className="grid gap-3 rounded-2xl border border-amber-400/20 bg-black/25 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-100/70">
                      {message.providerStatus || "QUEUED"}
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm leading-6 text-white/80">
                      {message.body}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      Queued {formatDateTime(message.createdAt)}
                      {message.toNumber ? ` · To ${formatPhone(message.toNumber)}` : ""}
                    </div>
                  </div>

                  <CancelQueuedSmsButton
                    messageId={message.id}
                    threadId={selectedThread.id}
                    filter={selectedFilter}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <AdminMessageThread
          selectedFilter={selectedFilter}
          thread={selectedThread}
        />
      </div>
    </section>
  );
}
