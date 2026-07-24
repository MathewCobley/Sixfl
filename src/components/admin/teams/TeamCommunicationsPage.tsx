// ========================================
// File: src/components/admin/teams/TeamCommunicationsPage.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationChannel,
  NotificationDispatchStatus,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { upsertTeamNotificationRecipient } from "@/lib/notifications/team-contacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Communications | SIXFL",
};

const PAGE_SIZE = 30;

type SearchParams = {
  page?: string;
};

type TimelineItem = {
  id: string;
  source: "dispatch" | "message" | "legacy";
  channel: NotificationChannel;
  direction: "Inbound" | "Outbound";
  status: string;
  subject: string;
  body: string;
  contactName: string;
  contactValue: string | null;
  occurredAt: Date;
  origin: string;
  templateName: string | null;
  failureReason: string | null;
};

function dispatchStatus(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
      return "Queued";
    case "PROCESSING":
      return "Processing";
    case "SENT":
      return "Sent";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    case "SKIPPED":
      return "Skipped";
    default:
      return status;
  }
}

function messageStatus(status: string | null | undefined) {
  const value = status?.trim().toLowerCase();
  if (value === "queued") return "Queued";
  if (value === "processing") return "Processing";
  if (value === "sent") return "Sent";
  if (value === "delivered") return "Delivered";
  if (value === "received") return "Received";
  if (value === "failed") return "Failed";
  if (value === "cancelled" || value === "canceled") return "Cancelled";
  if (value === "skipped") return "Skipped";
  return "Recorded";
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMetadataLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "Notification dispatch";
  }

  const originLabel = (metadata as Record<string, unknown>).originLabel;
  return typeof originLabel === "string" && originLabel.trim()
    ? originLabel.trim()
    : "Notification dispatch";
}

function getPage(value: string | undefined, totalPages: number) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(Math.max(parsed, 1), totalPages);
}

function typeLabel(item: TimelineItem) {
  if (item.source === "legacy") return "Legacy email";
  if (item.source === "dispatch") {
    return item.channel === NotificationChannel.EMAIL
      ? "System email"
      : "System SMS";
  }
  if (item.channel === NotificationChannel.EMAIL) {
    return item.direction === "Inbound" ? "Inbox email" : "Thread email";
  }
  return item.direction === "Inbound" ? "Inbox SMS" : "Thread SMS";
}

function directionTone(direction: TimelineItem["direction"]) {
  return direction === "Inbound"
    ? "border-sky-400/20 bg-sky-500/10 text-sky-100"
    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
}

function statusTone(item: TimelineItem) {
  if (item.failureReason || item.status === "Failed") {
    return "border-red-400/20 bg-red-500/10 text-red-200";
  }
  if (item.status === "Queued" || item.status === "Processing") {
    return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  }
  return "border-white/10 bg-white/5 text-white/65";
}

export default async function TeamCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  const sp = await searchParams;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      league: {
        select: {
          name: true,
          season: true,
        },
      },
      convertedFromLead: {
        select: {
          contactName: true,
          emails: {
            orderBy: { sentAt: "desc" },
            select: {
              id: true,
              subject: true,
              body: true,
              sentTo: true,
              sentAt: true,
            },
          },
        },
      },
    },
  });

  if (!team) notFound();

  const { snapshot, recipient } = await upsertTeamNotificationRecipient(team.id);

  const [dispatches, threads] = await Promise.all([
    prisma.notificationDispatch.findMany({
      where: {
        OR: [
          { sourceType: "TEAM", sourceId: team.id },
          { recipientId: recipient.id },
        ],
      },
      include: {
        recipient: true,
        template: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.messageThread.findMany({
      where: {
        OR: [{ teamId: team.id }, { recipientId: recipient.id }],
      },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 250,
          include: {
            dispatch: {
              select: {
                template: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
  ]);

  const linkedDispatchIds = new Set(
    threads.flatMap((thread) =>
      thread.messages
        .map((message) => message.notificationDispatchId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const dispatchTimeline: TimelineItem[] = dispatches
    .filter((dispatch) => !linkedDispatchIds.has(dispatch.id))
    .map((dispatch) => ({
      id: `dispatch-${dispatch.id}`,
      source: "dispatch",
      channel: dispatch.channel,
      direction: "Outbound",
      status: dispatchStatus(dispatch.status),
      subject:
        dispatch.subject?.trim() ||
        (dispatch.channel === NotificationChannel.SMS
          ? "SMS message"
          : "Email"),
      body: dispatch.bodyText || "No message body was recorded.",
      contactName: dispatch.recipient.displayName || team.name,
      contactValue:
        dispatch.channel === NotificationChannel.SMS
          ? dispatch.recipient.phone || null
          : dispatch.recipient.email || null,
      occurredAt: dispatch.sentAt ?? dispatch.createdAt,
      origin: getMetadataLabel(dispatch.metadata),
      templateName: dispatch.template?.name ?? null,
      failureReason: dispatch.failureReason,
    }));

  const messageTimeline: TimelineItem[] = threads.flatMap((thread) =>
    thread.messages.map((message) => {
      const direction =
        message.direction === "INBOUND" ? "Inbound" : "Outbound";
      const contactValue =
        direction === "Inbound"
          ? message.fromEmail || message.fromNumber || null
          : message.toEmail || message.toNumber || null;

      return {
        id: `message-${message.id}`,
        source: "message",
        channel: message.channel as NotificationChannel,
        direction,
        status: messageStatus(message.providerStatus),
        subject: message.subject || `${message.channel} message`,
        body: message.textBody || message.body || "No message body was recorded.",
        contactName: thread.contactName || snapshot.teamName || team.name,
        contactValue,
        occurredAt: message.receivedAt ?? message.sentAt ?? message.createdAt,
        origin: direction === "Inbound" ? "Inbox thread" : "Message thread",
        templateName: message.dispatch?.template?.name ?? null,
        failureReason: null,
      } satisfies TimelineItem;
    }),
  );

  const legacyTimeline: TimelineItem[] = (
    team.convertedFromLead?.emails ?? []
  ).map((email) => ({
    id: `legacy-${email.id}`,
    source: "legacy",
    channel: NotificationChannel.EMAIL,
    direction: "Outbound",
    status: "Sent",
    subject: email.subject?.trim() || "Email",
    body: email.body,
    contactName: team.convertedFromLead?.contactName || team.name,
    contactValue: email.sentTo,
    occurredAt: email.sentAt,
    origin: "Converted lead history",
    templateName: null,
    failureReason: null,
  }));

  const timeline = [
    ...dispatchTimeline,
    ...messageTimeline,
    ...legacyTimeline,
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const totalPages = Math.max(1, Math.ceil(timeline.length / PAGE_SIZE));
  const currentPage = getPage(sp.page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleTimeline = timeline.slice(start, start + PAGE_SIZE);
  const emailCount = timeline.filter(
    (item) => item.channel === NotificationChannel.EMAIL,
  ).length;
  const smsCount = timeline.filter(
    (item) => item.channel === NotificationChannel.SMS,
  ).length;
  const inboundCount = timeline.filter(
    (item) => item.direction === "Inbound",
  ).length;

  const pageHref = (page: number) =>
    `/admin/teams/${team.id}/communications?page=${page}`;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href={`/admin/teams/${team.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>
          <h1 className="mt-1 text-3xl font-semibold text-white">
            {team.name} communications
          </h1>
          <p className="mt-1 text-sm text-white/55">
            Team messages, inbox replies and historical email activity.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/teams/${team.id}`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
          >
            Team overview
          </Link>
          <Link
            href={`/admin/messages?composeTeam=${encodeURIComponent(team.id)}`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-100 hover:bg-emerald-500/15"
          >
            Open inbox
          </Link>
          <Link
            href={`/admin/teams/${team.id}/prospects`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
          >
            Prospects
          </Link>
        </div>
      </header>

      <section className="rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.05] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              Communication history
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/65">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                {snapshot.primaryContact.email ?? "No primary email"}
              </span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                {snapshot.primaryContact.phone ?? "No primary phone"}
              </span>
              {team.league ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                  {team.league.name}
                  {team.league.season ? ` · ${team.league.season}` : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[520px]">
            {[
              ["Timeline", timeline.length],
              ["Email", emailCount],
              ["SMS", smsCount],
              ["Inbound", inboundCount],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Timeline</h2>
            <p className="mt-1 text-sm text-white/50">
              Showing {timeline.length === 0 ? 0 : start + 1}–
              {Math.min(start + PAGE_SIZE, timeline.length)} of {timeline.length}.
              Open a row to read the message.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={pageHref(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage === 1}
              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm ${
                currentPage === 1
                  ? "pointer-events-none border-white/5 text-white/25"
                  : "border-white/10 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              Previous
            </Link>
            <span className="text-xs text-white/45">
              Page {currentPage} of {totalPages}
            </span>
            <Link
              href={pageHref(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage === totalPages}
              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm ${
                currentPage === totalPages
                  ? "pointer-events-none border-white/5 text-white/25"
                  : "border-white/10 bg-white/5 text-white hover:bg-white/10"
              }`}
            >
              Next
            </Link>
          </div>
        </div>

        {visibleTimeline.length === 0 ? (
          <div className="px-5 py-10 text-sm text-white/55">
            No communications have been logged for this team yet.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {visibleTimeline.map((item) => (
              <details key={item.id} className="group">
                <summary className="cursor-pointer list-none px-4 py-4 hover:bg-white/[0.035] [&::-webkit-details-marker]:hidden sm:px-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">
                          {typeLabel(item)}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${directionTone(item.direction)}`}
                        >
                          {item.direction}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${statusTone(item)}`}
                        >
                          {item.status}
                        </span>
                        {item.templateName ? (
                          <span className="hidden rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/50 md:inline-flex">
                            {item.templateName}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-sm font-semibold text-white sm:text-base">
                        {item.subject}
                      </h3>
                      <p className="mt-1 truncate text-xs text-white/45">
                        {item.contactName}
                        {item.contactValue ? ` · ${item.contactValue}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-4 text-xs text-white/45">
                      <span>{formatDate(item.occurredAt)}</span>
                      <span className="text-lg leading-none transition group-open:rotate-45">
                        +
                      </span>
                    </div>
                  </div>
                </summary>

                <div className="border-t border-white/10 bg-black/20 px-4 py-4 sm:px-5">
                  <div className="whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                    {item.body}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/50">
                      {item.origin}
                    </span>
                  </div>
                  {item.failureReason ? (
                    <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                      {item.failureReason}
                    </div>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
