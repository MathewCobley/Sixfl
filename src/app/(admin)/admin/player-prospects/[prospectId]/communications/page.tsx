// ========================================
// File: src/app/(admin)/admin/player-prospects/[prospectId]/communications/page.tsx
// ========================================

import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";

import CommunicationStatusBadge from "@/components/admin/communications/CommunicationStatusBadge";
import PlayerProspectCommunicationsComposer from "@/components/admin/communications/PlayerProspectCommunicationsComposer";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Player Prospect Communications | SIXFL",
};

type SearchParams = {
  saved?: string;
  channel?: string;
  error?: string;
};

type TimelineItem = {
  id: string;
  channel: NotificationChannel | "RESPONSE";
  direction: "INBOUND" | "OUTBOUND";
  statusLabel: string;
  sourceLabel: string;
  templateName: string | null;
  templateKey: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  contactName: string;
  contactValue: string | null;
  occurredAt: Date;
  failureReason: string | null;
};

type PlayerInterestResponseRow = {
  id: string;
  response: string;
  respondedAt: Date;
  teamName: string | null;
};

function getChannelLabel(value?: string) {
  return value === "sms" ? "SMS" : "email";
}

function getProspectName(input: { firstName: string; lastName: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
}

function normaliseEmail(value?: string | null) {
  const parsed = value?.trim().toLowerCase();
  return parsed || null;
}

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDispatchStatus(status: NotificationDispatchStatus) {
  switch (status) {
    case "QUEUED":
      return "QUEUED";
    case "PROCESSING":
      return "PROCESSING";
    case "SENT":
      return "SENT";
    case "FAILED":
      return "FAILED";
    case "CANCELLED":
      return "CANCELLED";
    case "SKIPPED":
      return "SKIPPED";
    default:
      return status;
  }
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getOriginLabel(metadata: unknown) {
  const record = getMetadataRecord(metadata);
  const value = record?.originLabel;

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "Notification dispatch";
}

function getSourceLabel(input: { metadata: unknown; sourceType?: string | null }) {
  const originLabel = getOriginLabel(input.metadata);

  if (originLabel !== "Notification dispatch") {
    return originLabel;
  }

  return input.sourceType || originLabel;
}

export default async function AdminPlayerProspectCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ prospectId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { prospectId } = await params;
  const filters = await searchParams;

  const prospect = await prisma.teamPlayerProspect.findUnique({
    where: {
      id: prospectId,
    },
    select: {
      id: true,
      teamId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      source: true,
      notes: true,
      availabilitySummary: true,
      preferredPositions: true,
      lastContactedAt: true,
      createdAt: true,
      updatedAt: true,
      team: {
        select: {
          id: true,
          joinSlug: true,
          name: true,
          claimCode: true,
          league: {
            select: {
              name: true,
              season: true,
            },
          },
        },
      },
    },
  });

  if (!prospect) {
    notFound();
  }

  const prospectName = getProspectName({
    firstName: prospect.firstName,
    lastName: prospect.lastName,
  }) || prospect.firstName;
  const prospectEmail = normaliseEmail(prospect.email);

  const playerMatchFees = await prisma.playerMatchFee.findMany({
    where: {
      prospectId: prospect.id,
    },
    select: {
      id: true,
    },
  });
  const playerMatchFeeIds = playerMatchFees.map((fee) => fee.id);
  const communicationSourceFilters = [
    {
      sourceType: "TEAM_PLAYER_PROSPECT",
      sourceId: prospect.id,
    },
    ...(playerMatchFeeIds.length > 0
      ? [
          {
            sourceType: {
              in: [
                "PLAYER_MATCH_FEE_REQUEST",
                "PLAYER_MATCH_FEE_CHASE_24H",
                "PLAYER_MATCH_FEE_CHASE_72H",
              ],
            },
            sourceId: {
              in: playerMatchFeeIds,
            },
          },
        ]
      : []),
  ];

  const threadFallbackFilters = prospectEmail
    ? [
        { emailNormalized: prospectEmail },
        {
          contactEmail: {
            equals: prospectEmail,
            mode: "insensitive" as const,
          },
        },
      ]
    : [];

  const dispatchFallbackFilters = prospectEmail
    ? [
        {
          recipient: {
            emailNormalized: prospectEmail,
          },
        },
        {
          recipient: {
            email: {
              equals: prospectEmail,
              mode: "insensitive" as const,
            },
          },
        },
      ]
    : [];

  const [threads, dispatches, playerResponses, emailTemplates, smsTemplates] = await Promise.all([
    prisma.messageThread.findMany({
      where: {
        OR: [...communicationSourceFilters, ...threadFallbackFilters],
      },
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 100,
          include: {
            dispatch: {
              select: {
                id: true,
                metadata: true,
                sourceType: true,
                template: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.notificationDispatch.findMany({
      where: {
        OR: [...communicationSourceFilters, ...dispatchFallbackFilters],
      },
      include: {
        recipient: true,
        template: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
    prisma.$queryRaw<PlayerInterestResponseRow[]>`
      SELECT
        response.id,
        response.response,
        response."respondedAt",
        team.name AS "teamName"
      FROM "PlayerInterestResponse" response
      LEFT JOIN "Team" team ON team.id = response."teamId"
      WHERE response."prospectId" = ${prospect.id}
      ORDER BY response."respondedAt" DESC
    `,
    prisma.emailTemplate.findMany({
      where: {
        isActive: true,
        audience: {
          in: ["PLAYER", "GENERAL"],
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        body: true,
        description: true,
        ctaLabel: true,
        ctaUrlKey: true,
      },
    }),
    prisma.notificationTemplate.findMany({
      where: {
        isActive: true,
        channel: "SMS",
        audience: {
          in: ["PLAYER", "GENERAL"],
        },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        body: true,
        description: true,
      },
    }),
  ]);

  const messageTimelineItems: TimelineItem[] = threads.flatMap((thread) =>
    thread.messages.map((message) => ({
      id: `message-${message.id}`,
      channel: message.channel,
      direction: message.direction,
      statusLabel: message.providerStatus || "RECORDED",
      sourceLabel: message.dispatch
        ? getSourceLabel({
            metadata: message.dispatch.metadata,
            sourceType: message.dispatch.sourceType,
          })
        : thread.sourceType || thread.emailNormalized === prospectEmail
          ? "Email-matched history"
          : "Inbox thread",
      templateName: message.dispatch?.template?.name ?? null,
      templateKey: message.dispatch?.template?.key ?? null,
      subject: message.subject || `${message.channel} message`,
      bodyText: message.textBody || message.body || "",
      bodyHtml: message.channel === NotificationChannel.EMAIL ? message.htmlBody || null : null,
      contactName: thread.contactName || prospectName,
      contactValue: message.toEmail || message.toNumber || message.fromEmail || message.fromNumber || null,
      occurredAt: message.receivedAt ?? message.sentAt ?? message.createdAt,
      failureReason: null,
    })),
  );

  const loggedDispatchIds = new Set(
    threads
      .flatMap((thread) => thread.messages)
      .map((message) => message.notificationDispatchId)
      .filter((dispatchId): dispatchId is string => Boolean(dispatchId)),
  );

  const unloggedDispatchTimelineItems: TimelineItem[] = dispatches
    .filter((dispatch) => !loggedDispatchIds.has(dispatch.id))
    .map((dispatch) => ({
      id: `dispatch-${dispatch.id}`,
      channel: dispatch.channel,
      direction: "OUTBOUND" as const,
      statusLabel: formatDispatchStatus(dispatch.status),
      sourceLabel:
        dispatch.sourceType || dispatch.recipient.emailNormalized === prospectEmail
          ? getSourceLabel({
              metadata: dispatch.metadata,
              sourceType: dispatch.sourceType,
            })
          : "Email-matched history",
      templateName: dispatch.template?.name ?? null,
      templateKey: dispatch.template?.key ?? null,
      subject:
        dispatch.subject?.trim() ||
        (dispatch.channel === NotificationChannel.SMS ? "SMS message" : "Email"),
      bodyText: dispatch.bodyText,
      bodyHtml:
        dispatch.channel === NotificationChannel.EMAIL
          ? dispatch.bodyHtml ?? null
          : null,
      contactName: dispatch.recipient.displayName || prospectName,
      contactValue:
        dispatch.channel === NotificationChannel.SMS
          ? dispatch.recipient.phone || null
          : dispatch.recipient.email || null,
      occurredAt: dispatch.sentAt ?? dispatch.scheduledFor ?? dispatch.createdAt,
      failureReason: dispatch.failureReason,
    }));

  const responseTimelineItems: TimelineItem[] = playerResponses.map((response) => ({
    id: `response-${response.id}`,
    channel: "RESPONSE" as const,
    direction: "INBOUND" as const,
    statusLabel: "RECORDED",
    sourceLabel: "YES/NO player response",
    templateName: null,
    templateKey: null,
    subject: `Player replied ${response.response}`,
    bodyText: response.teamName
      ? `${prospectName} replied ${response.response} for ${response.teamName}.`
      : `${prospectName} replied ${response.response}.`,
    bodyHtml: null,
    contactName: prospectName,
    contactValue: prospect.email || prospect.phone,
    occurredAt: response.respondedAt,
    failureReason: null,
  }));

  const timeline = [
    ...messageTimelineItems,
    ...unloggedDispatchTimelineItems,
    ...responseTimelineItems,
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const successMessage =
    filters.saved === "queued"
      ? `${getChannelLabel(filters.channel)} queued to prospect.`
      : null;
  const errorMessage = filters.error ? decodeURIComponent(filters.error) : null;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const joinUrl = prospect.team?.joinSlug
    ? `${baseUrl}/teams/join/${prospect.team.joinSlug}`
    : `${baseUrl}/register-interest`;
  const teamName = prospect.team?.name ?? "SIXFL player pool";
  const leagueName = prospect.team?.league
    ? `${prospect.team.league.name}${prospect.team.league.season ? ` — ${prospect.team.league.season}` : ""}`
    : null;
  const fixedPaymentUrl = "https://buy.stripe.com/14A14n95tclzg2udgL7IY02";

  const resolvedEmailTemplates = emailTemplates.map((template) => {
    const ctaUrl =
      template.ctaUrlKey === "signupUrl"
        ? `${baseUrl}/register-interest`
        : template.ctaUrlKey === "teamJoinUrl"
          ? joinUrl
          : template.ctaUrlKey === "paymentUrl"
            ? fixedPaymentUrl
            : null;

    return {
      id: template.id,
      key: template.key,
      name: template.name,
      subject: template.subject,
      body: template.body,
      description: template.description,
      ctaLabel: template.ctaLabel,
      ctaUrl,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link href="/admin/player-prospects" className="text-sm text-emerald-300 hover:text-emerald-200">
            ← Back to player prospects
          </Link>
          <h1 className="text-3xl font-semibold text-white">{prospectName} communications</h1>
          <p className="text-sm text-white/60">
            Full communication and history hub for this player prospect, including unassigned prospects and older email-matched history.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {prospect.team ? (
            <Link
              href={`/admin/teams/${prospect.team.id}/prospects`}
              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Team prospects
            </Link>
          ) : null}
          <Link
            href="/admin/player-prospects"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Player prospect pool
          </Link>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Player prospect communications</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Single outreach timeline</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              Use this as the one place to contact {prospectName}, review previous contact, and keep outreach tidy before or after assigning to a team.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Email: {prospect.email || "—"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Phone: {prospect.phone || "—"}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Status: {prospect.status}</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Team: {prospect.team?.name || "Unassigned"}</span>
              {prospectEmail ? (
                <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-100">Email fallback enabled</span>
              ) : null}
            </div>

            {prospect.notes || prospect.availabilitySummary || prospect.preferredPositions ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/60">
                {[prospect.preferredPositions, prospect.availabilitySummary, prospect.notes].filter(Boolean).join(" · ")}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Threads</p>
              <p className="mt-3 text-3xl font-semibold text-white">{threads.length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Timeline</p>
              <p className="mt-3 text-3xl font-semibold text-white">{timeline.length}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Responses</p>
              <p className="mt-3 text-3xl font-semibold text-white">{playerResponses.length}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <PlayerProspectCommunicationsComposer
          prospectId={prospect.id}
          fromPath={`/admin/player-prospects/${prospect.id}/communications`}
          toEmail={prospect.email}
          toPhone={prospect.phone}
          firstName={prospect.firstName}
          fullName={prospectName}
          teamName={teamName}
          leagueName={leagueName}
          joinUrl={joinUrl}
          emailTemplates={resolvedEmailTemplates}
          smsTemplates={smsTemplates}
        />

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">HISTORY</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Timeline</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {timeline.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">No communications have been logged yet.</div>
            ) : (
              timeline.map((item) => (
                <div key={item.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{item.channel}</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">{item.direction}</span>
                    <CommunicationStatusBadge status={item.statusLabel} />
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">{item.sourceLabel}</span>
                    {item.templateName ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">Template: {item.templateName}</span>
                    ) : null}
                    {item.templateKey ? (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] text-white/60">{item.templateKey}</span>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">{item.subject}</div>
                    <div className="mt-1 text-xs text-white/45">
                      {item.contactName}
                      {item.contactValue ? ` · ${item.contactValue}` : ""}
                    </div>
                  </div>

                  {item.channel === NotificationChannel.EMAIL && item.bodyHtml ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                      <EmailHtmlPreview html={item.bodyHtml} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">{item.bodyText}</div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
                    <span>{formatUkDateTime(item.occurredAt)}</span>
                  </div>

                  {item.failureReason ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-xs leading-5 text-red-100">
                      Failure: {item.failureReason}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
