import Link from "next/link";
import { notFound } from "next/navigation";
import {
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationRecipientSourceType,
  Prisma,
} from "@prisma/client";

import { formatDateTimeInLondon } from "@/lib/datetime/london";
import {
  getCaptainTeamThreadWhere,
  isCaptainUnreadMessage,
} from "@/lib/messaging/captain-inbox";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import {
  markAllCaptainMessagesReadAction,
  openCaptainMessageAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Messages | SIXFL",
};

const PAGE_SIZE = 25;
const VISIBLE_DISPATCH_STATUSES = [
  NotificationDispatchStatus.QUEUED,
  NotificationDispatchStatus.PROCESSING,
  NotificationDispatchStatus.SENT,
] as const;
const VISIBLE_DISPATCH_STATUS_SET = new Set<string>(
  VISIBLE_DISPATCH_STATUSES,
);

const FILTERS = [
  "all",
  "unread",
  "sixfl",
  "players",
  "fixtures",
  "payments",
  "kits",
] as const;

type CaptainMessageFilter = (typeof FILTERS)[number];
type CaptainMessageCategory = Exclude<CaptainMessageFilter, "all" | "unread">;

type SearchParams = {
  filter?: string;
  page?: string;
  message?: string;
  read?: string;
};

type TimelineItem = {
  key: string;
  messageEntryId: string | null;
  source: "message" | "dispatch" | "legacy";
  category: CaptainMessageCategory;
  channel: "EMAIL" | "SMS";
  direction: "INBOUND" | "OUTBOUND";
  subject: string;
  body: string;
  preview: string;
  occurredAt: Date;
  status: string;
  unread: boolean;
  senderLabel: string;
  contactLabel: string | null;
  originLabel: string;
  contextHref: string | null;
};

function normaliseFilter(value?: string): CaptainMessageFilter {
  return FILTERS.includes(value as CaptainMessageFilter)
    ? (value as CaptainMessageFilter)
    : "all";
}

function normalisePage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function formatDate(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cleanPreview(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "No message text was recorded.";
  return compact.length > 155 ? `${compact.slice(0, 152)}...` : compact;
}

function getMetadataText(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function getCategory(input: {
  sourceType?: string | null;
  templateKey?: string | null;
  templateName?: string | null;
  subject?: string | null;
  metadata?: unknown;
}) {
  const haystack = [
    input.sourceType,
    input.templateKey,
    input.templateName,
    input.subject,
    getMetadataText(input.metadata),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/kit|shirt|shorts|sock|badge|personalisation/.test(haystack)) {
    return "kits" as const;
  }
  if (
    /payment|match fee|fixture fee|charge|invoice|balance|credit|card|autopay|paid/.test(
      haystack,
    )
  ) {
    return "payments" as const;
  }
  if (
    /fixture|matchday|availability|confirmation|kickoff|kick-off|result|score|postpon|cancelled match/.test(
      haystack,
    )
  ) {
    return "fixtures" as const;
  }
  if (/player|squad|prospect|playerpool|player pool|join/.test(haystack)) {
    return "players" as const;
  }
  return "sixfl" as const;
}

function categoryLabel(category: CaptainMessageCategory) {
  switch (category) {
    case "players":
      return "Players";
    case "fixtures":
      return "Fixtures";
    case "payments":
      return "Payments";
    case "kits":
      return "Kits";
    default:
      return "SIXFL";
  }
}

function categoryTone(category: CaptainMessageCategory) {
  switch (category) {
    case "players":
      return "border-sky-400/20 bg-sky-500/10 text-sky-100";
    case "fixtures":
      return "border-violet-400/20 bg-violet-500/10 text-violet-100";
    case "payments":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "kits":
      return "border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100";
    default:
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
}

function getContextHref(input: {
  category: CaptainMessageCategory;
  teamId: string;
  isAdmin: boolean;
}) {
  switch (input.category) {
    case "players":
      return input.isAdmin
        ? `/captain/team/${input.teamId}/squad`
        : `/captain/team/${input.teamId}/captain-squad`;
    case "fixtures":
      return `/captain/team/${input.teamId}/fixtures`;
    case "payments":
      return `/captain/team/${input.teamId}/player-payments`;
    case "kits":
      return `/captain/team/${input.teamId}/kit`;
    default:
      return null;
  }
}

function getDefaultSubject(category: CaptainMessageCategory) {
  switch (category) {
    case "players":
      return "Player or squad message";
    case "fixtures":
      return "Fixture message";
    case "payments":
      return "Payment message";
    case "kits":
      return "Team kit message";
    default:
      return "SIXFL message";
  }
}

function dispatchStatusLabel(status: NotificationDispatchStatus) {
  switch (status) {
    case NotificationDispatchStatus.QUEUED:
      return "Queued";
    case NotificationDispatchStatus.PROCESSING:
      return "Processing";
    case NotificationDispatchStatus.SENT:
      return "Sent";
    default:
      return status;
  }
}

function messageStatusLabel(value?: string | null) {
  const status = value?.trim();
  if (!status) return "Recorded";
  const firstLine = status.split("\n")[0]?.trim() || "Recorded";
  return firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine;
}

function buildMessagesHref(input: {
  teamId: string;
  filter?: CaptainMessageFilter;
  page?: number;
  message?: string;
}) {
  const search = new URLSearchParams();
  if (input.filter && input.filter !== "all") {
    search.set("filter", input.filter);
  }
  if ((input.page ?? 1) > 1) search.set("page", String(input.page));
  if (input.message) search.set("message", input.message);
  const query = search.toString();
  return `/captain/team/${input.teamId}/messages${query ? `?${query}` : ""}`;
}

function getReadNotice(value?: string) {
  if (value === "1") return "Message marked as read.";
  if (!value?.startsWith("all-")) return null;
  const count = Number.parseInt(value.slice(4), 10);
  if (!Number.isFinite(count) || count <= 0) {
    return "There were no unread messages to update.";
  }
  return `${count} message${count === 1 ? "" : "s"} marked as read.`;
}

export default async function CaptainMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamid: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const sp = (await searchParams) ?? {};
  const selectedFilter = normaliseFilter(sp.filter);
  const requestedPage = normalisePage(sp.page);
  const canMarkRead = Boolean(
    access.isCaptain &&
      !access.isAdmin &&
      access.accessMode === "captain" &&
      access.user?.role !== "ADMIN",
  );

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      contactEmail: true,
      secondaryContactEmail: true,
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

  const announcementEmails = Array.from(
    new Set(
      [
        access.user?.email,
        team.contactEmail,
        team.secondaryContactEmail,
      ]
        .map((value) => value?.trim().toLowerCase() || "")
        .filter((value) => value.includes("@")),
    ),
  );

  const [threads, teamRecipients, announcementRecipients] = await Promise.all([
    prisma.messageThread.findMany({
      where: getCaptainTeamThreadWhere(team.id),
      include: {
        recipient: {
          select: {
            id: true,
            sourceType: true,
            sourceId: true,
            displayName: true,
            email: true,
            phone: true,
          },
        },
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 250,
          include: {
            createdByUser: {
              select: {
                name: true,
                email: true,
              },
            },
            dispatch: {
              select: {
                id: true,
                status: true,
                sourceType: true,
                sourceId: true,
                metadata: true,
                template: {
                  select: {
                    name: true,
                    key: true,
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
    prisma.notificationRecipient.findMany({
      where: {
        sourceType: NotificationRecipientSourceType.TEAM,
        sourceId: team.id,
      },
      select: { id: true },
    }),
    announcementEmails.length > 0
      ? prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT recipient."id"
          FROM "NotificationRecipient" recipient
          WHERE LOWER(TRIM(COALESCE(recipient."emailNormalized", recipient."email")))
            IN (${Prisma.join(announcementEmails)})
        `)
      : Promise.resolve([]),
  ]);

  const linkedDispatchIds = new Set(
    threads.flatMap((thread) =>
      thread.messages
        .map((message) => message.notificationDispatchId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const teamRecipientIds = teamRecipients.map((recipient) => recipient.id);
  const announcementRecipientIds = announcementRecipients.map(
    (recipient) => recipient.id,
  );
  const dispatchScopes: Prisma.NotificationDispatchWhereInput[] = [
    { sourceType: "TEAM", sourceId: team.id },
  ];

  if (teamRecipientIds.length > 0) {
    dispatchScopes.push({ recipientId: { in: teamRecipientIds } });
  }
  if (announcementRecipientIds.length > 0) {
    dispatchScopes.push({
      sourceType: "ANNOUNCEMENT",
      recipientId: { in: announcementRecipientIds },
    });
  }

  const dispatches = await prisma.notificationDispatch.findMany({
    where: {
      status: { in: [...VISIBLE_DISPATCH_STATUSES] },
      OR: dispatchScopes,
    },
    include: {
      recipient: {
        select: {
          displayName: true,
          email: true,
          phone: true,
        },
      },
      template: {
        select: {
          name: true,
          key: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });

  const messageTimeline: TimelineItem[] = threads.flatMap((thread) =>
    thread.messages.flatMap((message) => {
      if (
        message.direction === "OUTBOUND" &&
        message.dispatch &&
        !VISIBLE_DISPATCH_STATUS_SET.has(message.dispatch.status)
      ) {
        return [];
      }

      const sourceType = message.dispatch?.sourceType ?? thread.sourceType;
      const category = getCategory({
        sourceType,
        templateKey: message.dispatch?.template?.key,
        templateName: message.dispatch?.template?.name,
        subject: message.subject,
        metadata: message.dispatch?.metadata,
      });
      const body =
        message.textBody?.trim() ||
        message.body?.trim() ||
        "No message text was recorded.";
      const occurredAt =
        message.receivedAt ?? message.sentAt ?? message.createdAt;
      const direction = message.direction as "INBOUND" | "OUTBOUND";
      const senderLabel =
        direction === "OUTBOUND"
          ? "SIXFL"
          : thread.contactName || team.name;

      return [
        {
          key: `message-${message.id}`,
          messageEntryId: message.id,
          source: "message" as const,
          category,
          channel: message.channel as "EMAIL" | "SMS",
          direction,
          subject: message.subject?.trim() || getDefaultSubject(category),
          body,
          preview: cleanPreview(body),
          occurredAt,
          status: messageStatusLabel(
            message.providerStatus ?? message.dispatch?.status,
          ),
          unread: isCaptainUnreadMessage({
            direction: message.direction,
            readAt: message.readAt,
            createdAt: message.createdAt,
            notificationDispatchId: message.notificationDispatchId,
            sentAt: message.sentAt,
            providerStatus: message.providerStatus,
            dispatch: message.dispatch
              ? { status: message.dispatch.status }
              : null,
          }),
          senderLabel,
          contactLabel:
            direction === "OUTBOUND"
              ? thread.contactName ||
                thread.recipient?.displayName ||
                team.name
              : "SIXFL",
          originLabel:
            message.dispatch?.template?.name ||
            (direction === "INBOUND" ? "Message sent to SIXFL" : "Team message"),
          contextHref: getContextHref({
            category,
            teamId: team.id,
            isAdmin: access.isAdmin,
          }),
        } satisfies TimelineItem,
      ];
    }),
  );

  const dispatchTimeline: TimelineItem[] = dispatches
    .filter((dispatch) => !linkedDispatchIds.has(dispatch.id))
    .map((dispatch) => {
      const category = getCategory({
        sourceType: dispatch.sourceType,
        templateKey: dispatch.template?.key,
        templateName: dispatch.template?.name,
        subject: dispatch.subject,
        metadata: dispatch.metadata,
      });
      const body = dispatch.bodyText?.trim() || "No message text was recorded.";
      const isAnnouncement = dispatch.sourceType === "ANNOUNCEMENT";

      return {
        key: `dispatch-${dispatch.id}`,
        messageEntryId: null,
        source: "dispatch",
        category,
        channel: dispatch.channel as "EMAIL" | "SMS",
        direction: "OUTBOUND",
        subject: dispatch.subject?.trim() || getDefaultSubject(category),
        body,
        preview: cleanPreview(body),
        occurredAt: dispatch.sentAt ?? dispatch.createdAt,
        status: dispatchStatusLabel(dispatch.status),
        unread: false,
        senderLabel: "SIXFL",
        contactLabel:
          dispatch.recipient.displayName ||
          dispatch.recipient.email ||
          dispatch.recipient.phone ||
          team.name,
        originLabel:
          dispatch.template?.name ||
          (isAnnouncement ? "SIXFL announcement" : "SIXFL notification"),
        contextHref: getContextHref({
          category,
          teamId: team.id,
          isAdmin: access.isAdmin,
        }),
      } satisfies TimelineItem;
    });

  const legacyTimeline: TimelineItem[] = (
    team.convertedFromLead?.emails ?? []
  ).map((email) => {
    const category = getCategory({ subject: email.subject });
    return {
      key: `legacy-${email.id}`,
      messageEntryId: null,
      source: "legacy",
      category,
      channel: NotificationChannel.EMAIL,
      direction: "OUTBOUND",
      subject: email.subject?.trim() || getDefaultSubject(category),
      body: email.body,
      preview: cleanPreview(email.body),
      occurredAt: email.sentAt,
      status: "Sent",
      unread: false,
      senderLabel: "SIXFL",
      contactLabel:
        team.convertedFromLead?.contactName || email.sentTo || team.name,
      originLabel: "Earlier team email",
      contextHref: getContextHref({
        category,
        teamId: team.id,
        isAdmin: access.isAdmin,
      }),
    } satisfies TimelineItem;
  });

  const timeline = [
    ...messageTimeline,
    ...dispatchTimeline,
    ...legacyTimeline,
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const unreadCount = timeline.filter((item) => item.unread).length;
  const emailCount = timeline.filter((item) => item.channel === "EMAIL").length;
  const smsCount = timeline.filter((item) => item.channel === "SMS").length;
  const filterCounts = new Map<CaptainMessageFilter, number>([
    ["all", timeline.length],
    ["unread", unreadCount],
    ["sixfl", timeline.filter((item) => item.category === "sixfl").length],
    ["players", timeline.filter((item) => item.category === "players").length],
    ["fixtures", timeline.filter((item) => item.category === "fixtures").length],
    ["payments", timeline.filter((item) => item.category === "payments").length],
    ["kits", timeline.filter((item) => item.category === "kits").length],
  ]);

  const filteredTimeline = timeline.filter((item) => {
    if (selectedFilter === "all") return true;
    if (selectedFilter === "unread") return item.unread;
    return item.category === selectedFilter;
  });
  const totalPages = Math.max(
    1,
    Math.ceil(filteredTimeline.length / PAGE_SIZE),
  );
  const currentPage = Math.min(requestedPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleTimeline = filteredTimeline.slice(start, start + PAGE_SIZE);
  const selectedItem =
    timeline.find((item) => item.key === sp.message) ??
    visibleTimeline[0] ??
    filteredTimeline[0] ??
    timeline[0] ??
    null;
  const readNotice = getReadNotice(sp.read);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_36%),rgba(255,255,255,0.04)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)] lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
              Team communications
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Messages
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">
              Official SIXFL emails, SMS messages, announcements and recorded team replies are kept together here for {team.name}.
            </p>
          </div>

          {canMarkRead && unreadCount > 0 ? (
            <form action={markAllCaptainMessagesReadAction}>
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="filter" value={selectedFilter} />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300"
              >
                Mark all as read
              </button>
            </form>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["All messages", timeline.length],
            ["Unread", unreadCount],
            ["Email", emailCount],
            ["SMS", smsCount],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {readNotice ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {readNotice}
        </section>
      ) : null}

      {!canMarkRead && access.isAdmin ? (
        <section className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4 text-sm leading-6 text-violet-100">
          Admin view: opening messages here does not clear the captain&apos;s unread markers.
        </section>
      ) : null}

      <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 text-sm leading-6 text-sky-50/80">
        <p className="font-semibold text-white">What is included</p>
        <p className="mt-2">
          This is the team&apos;s official SIXFL communication history. Private conversations between an individual player and SIXFL are not shown unless they form part of a team-level message.
        </p>
        <p className="mt-2 text-sky-100/60">
          WhatsApp remains separate because it is an external team chat rather than a SIXFL message record.
        </p>
      </section>

      <nav
        aria-label="Message filters"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-3"
      >
        {FILTERS.map((filter) => {
          const active = selectedFilter === filter;
          const label =
            filter === "all"
              ? "All"
              : filter === "unread"
                ? "Unread"
                : categoryLabel(filter);
          return (
            <Link
              key={filter}
              href={buildMessagesHref({ teamId: team.id, filter })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              {label} {filterCounts.get(filter) ?? 0}
            </Link>
          );
        })}
      </nav>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-xl font-semibold text-white">Message history</h2>
            <p className="mt-1 text-sm text-white/50">
              Showing {filteredTimeline.length === 0 ? 0 : start + 1}–
              {Math.min(start + PAGE_SIZE, filteredTimeline.length)} of {filteredTimeline.length}.
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {visibleTimeline.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-white/50">
                No messages match this filter yet.
              </div>
            ) : null}

            {visibleTimeline.map((item) => {
              const active = selectedItem?.key === item.key;
              const content = (
                <div className="flex w-full gap-3 px-5 py-4 text-left">
                  <span
                    className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                      item.unread ? "bg-emerald-300" : "bg-white/15"
                    }`}
                    aria-label={item.unread ? "Unread" : "Read"}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">
                        {item.subject}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${categoryTone(
                          item.category,
                        )}`}
                      >
                        {categoryLabel(item.category)}
                      </span>
                      {item.unread ? (
                        <span className="rounded-full bg-emerald-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black">
                          New
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-white/40">
                      {item.senderLabel} · {item.channel} · {formatDate(item.occurredAt)}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-white/58">
                      {item.preview}
                    </span>
                  </span>
                </div>
              );

              if (item.unread && item.messageEntryId && canMarkRead) {
                return (
                  <form key={item.key} action={openCaptainMessageAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input
                      type="hidden"
                      name="messageId"
                      value={item.messageEntryId}
                    />
                    <input type="hidden" name="itemKey" value={item.key} />
                    <input type="hidden" name="filter" value={selectedFilter} />
                    <input type="hidden" name="page" value={currentPage} />
                    <button
                      type="submit"
                      className={`block w-full transition hover:bg-white/[0.04] ${
                        active ? "bg-emerald-500/[0.08]" : ""
                      }`}
                    >
                      {content}
                    </button>
                  </form>
                );
              }

              return (
                <Link
                  key={item.key}
                  href={`${buildMessagesHref({
                    teamId: team.id,
                    filter: selectedFilter,
                    page: currentPage,
                    message: item.key,
                  })}#message-detail`}
                  className={`block transition hover:bg-white/[0.04] ${
                    active ? "bg-emerald-500/[0.08]" : ""
                  }`}
                >
                  {content}
                </Link>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
              <Link
                href={buildMessagesHref({
                  teamId: team.id,
                  filter: selectedFilter,
                  page: Math.max(1, currentPage - 1),
                })}
                aria-disabled={currentPage === 1}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  currentPage === 1
                    ? "pointer-events-none border-white/5 text-white/25"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                Previous
              </Link>
              <span className="text-xs text-white/40">
                Page {currentPage} of {totalPages}
              </span>
              <Link
                href={buildMessagesHref({
                  teamId: team.id,
                  filter: selectedFilter,
                  page: Math.min(totalPages, currentPage + 1),
                })}
                aria-disabled={currentPage === totalPages}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  currentPage === totalPages
                    ? "pointer-events-none border-white/5 text-white/25"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                Next
              </Link>
            </div>
          ) : null}
        </div>

        <div id="message-detail" className="min-w-0">
          {selectedItem ? (
            <article className="sticky top-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${categoryTone(
                        selectedItem.category,
                      )}`}
                    >
                      {categoryLabel(selectedItem.category)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                      {selectedItem.channel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
                      {selectedItem.status}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-white">
                    {selectedItem.subject}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    {selectedItem.direction === "OUTBOUND"
                      ? `From ${selectedItem.senderLabel}${selectedItem.contactLabel ? ` to ${selectedItem.contactLabel}` : ""}`
                      : `${selectedItem.senderLabel} sent this to SIXFL`}
                    {` · ${formatDate(selectedItem.occurredAt)}`}
                  </p>
                  <p className="mt-1 text-xs text-white/35">
                    {selectedItem.originLabel}
                  </p>
                </div>

                {selectedItem.contextHref ? (
                  <Link
                    href={selectedItem.contextHref}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
                  >
                    Open related area
                  </Link>
                ) : null}
              </div>

              <pre className="mt-6 whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/25 p-5 font-sans text-sm leading-7 text-white/75">
                {selectedItem.body}
              </pre>
            </article>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-sm text-white/50">
              Your team&apos;s messages will appear here as SIXFL communications are recorded.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
