// ========================================
// File: src/components/admin/messages/AdminMessagesInbox.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo } from "react";

import AdminMessageThreadReplyRouter from "@/components/admin/messages/AdminMessageThreadReplyRouter";

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

function formatDateTime(value: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getThreadTitle(thread: InboxThreadListItem) {
  if (thread.team?.teamMode === "MANAGED") {
    return thread.contactName || thread.contactEmail || thread.contactPhone || thread.team.name;
  }

  return (
    thread.team?.name ||
    thread.contactName ||
    thread.contactEmail ||
    thread.contactPhone ||
    "Unknown contact"
  );
}

function getThreadSubtitle(thread: InboxThreadListItem) {
  const league = thread.league
    ? thread.league.season
      ? `${thread.league.name} · ${thread.league.season}`
      : thread.league.name
    : null;

  const managed = thread.team?.teamMode === "MANAGED" && thread.team
    ? `Managed team: ${thread.team.name}`
    : null;

  return [managed, league].filter(Boolean).join(" · ") ||
    (thread.channel === "EMAIL" ? "Email conversation" : "SMS conversation");
}

function getAvatarLabel(thread: InboxThreadListItem) {
  return getThreadTitle(thread).slice(0, 2).toUpperCase();
}

function getPreviewText(thread: InboxThreadListItem) {
  if (thread.unreadForAdminCount > 0 && thread.latestMessage?.direction !== "INBOUND") {
    return "New reply received. Open this conversation to review the inbound message.";
  }

  return thread.lastMessagePreview || "No preview available yet.";
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
      { key: "unread" as const, label: "Unread", count: threads.filter((thread) => thread.unreadForAdminCount > 0).length },
      { key: "open" as const, label: "Open", count: threads.filter((thread) => thread.status === "OPEN").length },
      { key: "archived" as const, label: "Archived", count: threads.filter((thread) => thread.status === "ARCHIVED").length },
      { key: "all" as const, label: "All", count: threads.length },
    ],
    [threads],
  );

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="border-b border-white/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Inbox</div>
              <h2 className="mt-2 text-xl font-semibold text-white">Team conversations</h2>
              <p className="mt-2 text-sm text-white/55">
                Replies are grouped into threads across email and SMS.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">Leagues</div>
              <div className="mt-1 text-lg font-semibold text-white">{leagues.length}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {filterItems.map((item) => {
              const active = selectedFilter === item.key;
              return (
                <Link
                  key={item.key}
                  href={`${ADMIN_MESSAGES_BASE_PATH}?filter=${item.key}`}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "border-emerald-400/30 bg-emerald-400/12 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] ${active ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10 text-white/60"}`}>
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
              No message threads yet.
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => {
                const isSelected = selectedThreadId === thread.id;
                const isManagedTeam = thread.team?.teamMode === "MANAGED";
                const hasUnreadInbound = thread.unreadForAdminCount > 0;
                const latestIsInbound = thread.latestMessage?.direction === "INBOUND";

                return (
                  <Link
                    key={thread.id}
                    href={`${ADMIN_MESSAGES_BASE_PATH}?filter=${selectedFilter}&thread=${thread.id}`}
                    className={`relative block overflow-hidden rounded-3xl border p-4 transition ${
                      hasUnreadInbound
                        ? "border-amber-300/50 bg-amber-300/[0.10] shadow-[0_0_0_1px_rgba(252,211,77,0.16),0_18px_50px_rgba(245,158,11,0.12)]"
                        : isSelected
                          ? "border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
                          : "border-white/10 bg-black/20 hover:border-white/15 hover:bg-white/[0.04]"
                    }`}
                  >
                    {hasUnreadInbound ? (
                      <div className="absolute inset-y-0 left-0 w-1.5 bg-amber-300" />
                    ) : null}

                    <div className="flex items-start gap-3">
                      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold ${hasUnreadInbound ? "border-amber-300/40 bg-amber-300/15 text-amber-100" : "border-white/10 bg-white/[0.04] text-white"}`}>
                        {thread.team?.logoUrl && !isManagedTeam ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thread.team.logoUrl} alt={thread.team.name} className="h-full w-full rounded-2xl object-cover" />
                        ) : (
                          <span>{getAvatarLabel(thread)}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className={`truncate text-sm font-semibold ${hasUnreadInbound ? "text-amber-50" : "text-white"}`}>{getThreadTitle(thread)}</div>
                              {isManagedTeam ? (
                                <span className="shrink-0 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                                  Managed
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 truncate text-xs text-white/45">{getThreadSubtitle(thread)}</div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {hasUnreadInbound ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[0_0_24px_rgba(252,211,77,0.35)]">
                                <span className="h-1.5 w-1.5 rounded-full bg-black" />
                                New reply
                              </span>
                            ) : null}
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">{thread.channel}</span>
                              <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">{thread.status}</span>
                            </div>
                            {hasUnreadInbound ? (
                              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-amber-300 px-2 py-1 text-[11px] font-bold text-black">
                                {thread.unreadForAdminCount}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {hasUnreadInbound ? (
                          <div className="mt-3 rounded-2xl border border-amber-300/25 bg-black/25 px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                              New message received
                            </div>
                            <div className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-white">
                              {getPreviewText(thread)}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 line-clamp-2 text-sm leading-6 text-white/65">
                            {getPreviewText(thread)}
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/40">
                          <span className={hasUnreadInbound ? "font-semibold text-amber-200" : ""}>
                            {hasUnreadInbound
                              ? `Action needed · ${thread.unreadForAdminCount} unread inbound ${thread.unreadForAdminCount === 1 ? "reply" : "replies"}`
                              : latestIsInbound
                                ? "Latest: inbound"
                                : "Latest: outbound"}
                          </span>
                          <span>{formatDateTime(hasUnreadInbound ? thread.latestInboundAt : thread.latestMessageAt)}</span>
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

      <AdminMessageThreadReplyRouter selectedFilter={selectedFilter} thread={selectedThread} />
    </section>
  );
}
