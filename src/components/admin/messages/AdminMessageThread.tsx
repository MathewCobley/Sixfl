// ========================================
// File: src/components/admin/messages/AdminMessageThread.tsx
// ========================================

"use client";

import Link from "next/link";
import { markMessageThreadReadAction } from "@/app/(admin)/admin/messages/actions";

type SelectedThread = {
  id: string;
  status: "OPEN" | "ARCHIVED" | "CLOSED";
  contactName: string | null;
  contactPhone: string | null;
  phoneNormalized: string | null;
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
    audience: string;
    sourceType: string;
  } | null;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    participantRole: "ADMIN" | "CAPTAIN" | "CONTACT" | "SYSTEM";
    body: string;
    fromNumber: string | null;
    toNumber: string | null;
    providerStatus: string | null;
    sentAt: string | null;
    receivedAt: string | null;
    readAt: string | null;
    createdAt: string;
  }>;
} | null;

type AdminMessageThreadProps = {
  selectedFilter: "unread" | "open" | "archived" | "all";
  thread: SelectedThread;
};

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
    thread.recipient?.displayName ||
    thread.contactPhone ||
    thread.phoneNormalized ||
    "Unknown contact"
  );
}

function getAudienceLabel(thread: NonNullable<SelectedThread>): string {
  if (thread.team) return "Team thread";
  if (thread.recipient?.audience) return `${thread.recipient.audience} contact`;
  return "General contact";
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

function getMessageMeta(message: NonNullable<SelectedThread>["messages"][number]): string {
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

export default function AdminMessageThread({
  selectedFilter,
  thread,
}: AdminMessageThreadProps) {
  if (!thread) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
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

  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="border-b border-white/10 p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] border border-white/10 bg-white/[0.04] text-sm font-semibold text-white">
              {thread.team?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thread.team.logoUrl}
                  alt={thread.team.name}
                  className="h-full w-full rounded-[1.25rem] object-cover"
                />
              ) : (
                <span>{title.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
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
                <p className="mt-2 text-sm text-white/55">{getAudienceLabel(thread)}</p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-white/45">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Phone: {formatPhone(thread.contactPhone || thread.recipient?.phone || thread.phoneNormalized)}
                </span>

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
                  <button
                    type="submit"
                    disabled={thread.unreadForAdminCount === 0}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
                  >
                    {thread.unreadForAdminCount > 0
                      ? `Mark read (${thread.unreadForAdminCount})`
                      : "Already read"}
                  </button>
                </form>

                <Link
                  href={`/admin/messages?filter=${selectedFilter}&thread=${thread.id}`}
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
      </div>

      <div className="grid gap-6 p-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Conversation timeline</h3>
              <p className="mt-1 text-sm text-white/50">
                Full inbound and outbound SMS history for this contact.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/55">
              {thread.messages.length} messages
            </div>
          </div>

          {thread.messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-white/55">
              No messages have been saved to this thread yet.
            </div>
          ) : (
            <div className="space-y-4">
              {thread.messages.map((message) => {
                const isInbound = message.direction === "INBOUND";

                return (
                  <div
                    key={message.id}
                    className={`flex ${isInbound ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-[1.5rem] border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.2)]",
                        isInbound
                          ? "border-white/10 bg-white/[0.05] text-white"
                          : "border-emerald-400/20 bg-emerald-400/10 text-emerald-50",
                      ].join(" ")}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                        <span className={isInbound ? "text-white/45" : "text-emerald-200/80"}>
                          {getMessageRoleLabel(message)}
                        </span>
                        <span className={isInbound ? "text-white/25" : "text-emerald-200/50"}>
                          •
                        </span>
                        <span className={isInbound ? "text-white/45" : "text-emerald-200/80"}>
                          {getMessageMeta(message)}
                        </span>
                      </div>

                      <div className="whitespace-pre-wrap text-sm leading-6">
                        {message.body}
                      </div>

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
          <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
            <h3 className="text-lg font-semibold text-white">Contact details</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Display name
                </div>
                <div className="mt-1 text-white/80">
                  {thread.contactName || thread.recipient?.displayName || "—"}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
                  Phone
                </div>
                <div className="mt-1 text-white/80">
                  {formatPhone(thread.contactPhone || thread.recipient?.phone || thread.phoneNormalized)}
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

          <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
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
