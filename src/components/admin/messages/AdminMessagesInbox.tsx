// ========================================
// File: src/components/admin/messages/AdminMessagesInbox.tsx
// ========================================

"use client";

import Link from "next/link";
import { useMemo } from "react";
import AdminMessageThread from "@/components/admin/messages/AdminMessageThread";

const ADMIN_MESSAGES_BASE_PATH = "/admin/messaging";

type InboxLeague = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
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

function getThreadTitle(thread: InboxThreadListItem): string {
  return (
    thread.team?.name ||
    thread.contactName ||
    thread.contactEmail ||
    thread.emailNormalized ||
    thread.contactPhone ||
    thread.phoneNormalized ||
    "Unknown contact"
  );
}

function getThreadSubtitle(thread: InboxThreadListItem): string {
  const primaryContact =
    thread.channel === "EMAIL"
      ? thread.contactEmail || thread.emailNormalized
      : thread.contactPhone
        ? formatPhone(thread.contactPhone)
        : thread.phoneNormalized;

  const parts = [
    thread.league
      ? thread.league.season
        ? `${thread.league.name} · ${thread.league.season}`
        : thread.league.name
      : null,
    primaryContact,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" · ");
  }

  return thread.channel === "EMAIL" ? "General email contact" : "General SMS contact";
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
                        {thread.team?.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thread.team.logoUrl}
                            alt={thread.team.name}
                            className="h-full w-full rounded-2xl object-cover"
                          />
                        ) : (
                          <span>
                            {(thread.team?.name || thread.contactName || thread.contactEmail || "M")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {getThreadTitle(thread)}
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

      <AdminMessageThread
        selectedFilter={selectedFilter}
        thread={selectedThread}
      />
    </section>
  );
}
