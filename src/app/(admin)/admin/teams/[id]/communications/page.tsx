// ========================================
// File: src/app/(admin)/admin/teams/[id]/communications/page.tsx
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
import { buildChargePaymentUrl } from "@/lib/payments/fixture-match-fees";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Team Communications | SIXFL",
};

type SearchParams = {
  saved?: string;
  channel?: string;
  error?: string;
};

type TimelineItem = {
  id: string;
  source: "dispatch" | "message" | "legacyLeadEmail";
  channel: NotificationChannel;
  directionLabel: string;
  statusLabel: string;
  sourceLabel: string;
  templateName: string | null;
  templateKey: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  contactLabel: string;
  contactValue: string | null;
  occurredAt: Date;
  failureReason: string | null;
  cta: { label: string; url: string } | null;
};

function getDirectionLabel(value: string) {
  return value === "INBOUND" ? "Inbound" : "Outbound";
}

function formatDispatchStatus(status: NotificationDispatchStatus) {
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

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function getDispatchOriginLabel(metadata: unknown) {
  const record = getMetadataRecord(metadata);
  const value = record?.originLabel;

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "Notification dispatch";
}

function getDispatchCta(input: {
  metadata: unknown;
  matchFeeCtaUrl?: string | null;
}) {
  const metadata = getMetadataRecord(input.metadata);

  const ctaLabel =
    typeof metadata?.ctaLabel === "string" && metadata.ctaLabel.trim()
      ? metadata.ctaLabel.trim()
      : null;

  const ctaUrl =
    typeof metadata?.ctaUrl === "string" && metadata.ctaUrl.trim()
      ? metadata.ctaUrl.trim()
      : null;

  if (ctaLabel && ctaUrl) {
    return { label: ctaLabel, url: ctaUrl };
  }

  const paymentUrl =
    typeof metadata?.paymentUrl === "string" && metadata.paymentUrl.trim()
      ? metadata.paymentUrl.trim()
      : null;

  if (paymentUrl) {
    return { label: "Pay now", url: paymentUrl };
  }

  if (input.matchFeeCtaUrl) {
    return {
      label: "Review & pay match fee",
      url: input.matchFeeCtaUrl,
    };
  }

  return null;
}

function formatHistoryBodyText(
  bodyText: string,
  cta: { label: string; url: string } | null,
) {
  const filteredLines = bodyText
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();

      if (trimmed === "{{cta}}") {
        return false;
      }

      if (cta && (trimmed === `${cta.label}: ${cta.url}` || trimmed === cta.url)) {
        return false;
      }

      return true;
    });

  return filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function getTimelineTone(item: TimelineItem) {
  if (item.failureReason || item.statusLabel === "Failed") {
    return "border-red-400/20 bg-red-500/10 text-red-200";
  }

  if (item.directionLabel === "Inbound") {
    return "border-sky-400/20 bg-sky-500/10 text-sky-100";
  }

  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
}

export default async function AdminTeamCommunicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const { id } = await params;
  await searchParams;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      claimCode: true,
      joinSlug: true,
      league: {
        select: {
          id: true,
          name: true,
          season: true,
        },
      },
      convertedFromLead: {
        select: {
          id: true,
          contactName: true,
          email: true,
          phone: true,
          emails: {
            orderBy: {
              sentAt: "desc",
            },
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

  if (!team) {
    notFound();
  }

  const { snapshot, recipient } = await upsertTeamNotificationRecipient(team.id);

  const [dispatches, threads] = await Promise.all([
    prisma.notificationDispatch.findMany({
      where: {
        OR: [
          {
            sourceType: "TEAM",
            sourceId: team.id,
          },
          {
            recipientId: recipient.id,
          },
        ],
      },
      include: {
        recipient: true,
        template: {
          select: {
            id: true,
            name: true,
            key: true,
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
        },
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 100,
    }),
  ]);

  const matchFeeChargeIds = Array.from(
    new Set(
      dispatches
        .filter(
          (dispatch) =>
            dispatch.sourceType === "FIXTURE_MATCH_FEE" ||
            dispatch.sourceType === "FIXTURE_MATCH_FEE_REMINDER",
        )
        .map((dispatch) => dispatch.sourceId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const matchFeeCharges = matchFeeChargeIds.length
    ? await prisma.paymentCharge.findMany({
        where: {
          id: {
            in: matchFeeChargeIds,
          },
        },
        select: {
          id: true,
          paymentToken: true,
        },
      })
    : [];

  const matchFeeCtaUrlByChargeId = new Map(
    matchFeeCharges
      .filter((charge) => Boolean(charge.paymentToken))
      .map((charge) => [
        charge.id,
        buildChargePaymentUrl(charge.paymentToken as string),
      ]),
  );

  const timeline: TimelineItem[] = [
    ...dispatches.map((dispatch) => {
      const matchFeeCtaUrl =
        dispatch.sourceType === "FIXTURE_MATCH_FEE" ||
        dispatch.sourceType === "FIXTURE_MATCH_FEE_REMINDER"
          ? dispatch.sourceId
            ? matchFeeCtaUrlByChargeId.get(dispatch.sourceId) ?? null
            : null
          : null;

      const cta = getDispatchCta({
        metadata: dispatch.metadata,
        matchFeeCtaUrl,
      });

      return {
        id: `dispatch-${dispatch.id}`,
        source: "dispatch" as const,
        channel: dispatch.channel,
        directionLabel: "Outbound",
        statusLabel: formatDispatchStatus(dispatch.status),
        sourceLabel: getDispatchOriginLabel(dispatch.metadata),
        templateName: dispatch.template?.name ?? null,
        templateKey: dispatch.template?.key ?? null,
        subject:
          dispatch.subject?.trim() ||
          (dispatch.channel === NotificationChannel.SMS ? "SMS message" : "Email"),
        bodyText: formatHistoryBodyText(dispatch.bodyText, cta),
        bodyHtml:
          dispatch.channel === NotificationChannel.EMAIL
            ? dispatch.bodyHtml ?? null
            : null,
        contactLabel: dispatch.recipient.displayName || team.name,
        contactValue:
          dispatch.channel === NotificationChannel.SMS
            ? dispatch.recipient.phone || null
            : dispatch.recipient.email || null,
        occurredAt: dispatch.sentAt ?? dispatch.createdAt,
        failureReason: dispatch.failureReason,
        cta,
      };
    }),
    ...threads.flatMap((thread) =>
      thread.messages.map((message) => ({
        id: `message-${message.id}`,
        source: "message" as const,
        channel: message.channel,
        directionLabel: getDirectionLabel(message.direction),
        statusLabel: message.providerStatus || "Recorded",
        sourceLabel: "Inbox thread",
        templateName: null,
        templateKey: null,
        subject: message.subject || `${message.channel} message`,
        bodyText: message.textBody || message.body || "",
        bodyHtml: message.channel === "EMAIL" ? message.htmlBody || null : null,
        contactLabel: thread.contactName || snapshot.teamName || team.name,
        contactValue: message.toEmail || message.toNumber || message.fromNumber || null,
        occurredAt: message.receivedAt ?? message.sentAt ?? message.createdAt,
        failureReason: null,
        cta: null,
      })),
    ),
    ...(team.convertedFromLead?.emails ?? []).map((email) => ({
      id: `lead-email-${email.id}`,
      source: "legacyLeadEmail" as const,
      channel: NotificationChannel.EMAIL,
      directionLabel: "Outbound",
      statusLabel: "Sent",
      sourceLabel: "Converted lead history",
      templateName: null,
      templateKey: null,
      subject: email.subject?.trim() || "Email",
      bodyText: email.body,
      bodyHtml: null,
      contactLabel: team.convertedFromLead?.contactName || team.name,
      contactValue: email.sentTo,
      occurredAt: email.sentAt,
      failureReason: null,
      cta: null,
    })),
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const inboxUrl = `/admin/messages?composeTeam=${encodeURIComponent(team.id)}`;
  const emailCount = timeline.filter((item) => item.channel === NotificationChannel.EMAIL).length;
  const smsCount = timeline.filter((item) => item.channel === NotificationChannel.SMS).length;
  const inboundCount = timeline.filter((item) => item.directionLabel === "Inbound").length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Link
            href={`/admin/teams/${team.id}`}
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to team
          </Link>
          <h1 className="text-3xl font-semibold text-white">{team.name} communications</h1>
          <p className="text-sm text-white/60">
            Full team communication history in one place, combining dispatches, inbox thread messages, and converted lead email history.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/teams/${team.id}`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Team overview
          </Link>
          <Link
            href={inboxUrl}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Open inbox
          </Link>
          <Link
            href={`/admin/teams/${team.id}/prospects`}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Prospects
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-[2rem] border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
        <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Total history
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Unified timeline
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
              This view combines team dispatches, inbox replies, inbox outbound messages, and converted lead email history into one team-level record.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Primary email: {snapshot.primaryContact.email ?? "—"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                Primary phone: {snapshot.primaryContact.phone ?? "—"}
              </span>
              {team.league ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  {team.league.name}
                  {team.league.season ? ` · ${team.league.season}` : ""}
                </span>
              ) : null}
              {team.joinSlug ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">
                  Join page live
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Timeline</p>
              <p className="mt-3 text-3xl font-semibold text-white">{timeline.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Email</p>
              <p className="mt-3 text-3xl font-semibold text-white">{emailCount}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">SMS</p>
              <p className="mt-3 text-3xl font-semibold text-white">{smsCount}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">Inbound</p>
              <p className="mt-3 text-3xl font-semibold text-white">{inboundCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.42fr_1.58fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Operational note</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Use the inbox</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">
            This page is now the total team communications history. New sends and live reply handling still happen from the admin inbox.
          </p>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              History here is pulled from multiple sources, not just one thread view.
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              Use the admin inbox for active messaging and reply handling.
            </div>
            <Link
              href={inboxUrl}
              className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15"
            >
              Open admin inbox
            </Link>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">History</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Timeline</h2>
            </div>
          </div>

          <div className="divide-y divide-white/10">
            {timeline.length === 0 ? (
              <div className="px-6 py-10 text-sm text-white/55">
                No communications have been logged for this team yet.
              </div>
            ) : (
              timeline.map((item) => (
                <div key={item.id} className="space-y-3 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                      {item.channel}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] ${getTimelineTone(item)}`}>
                      {item.directionLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
                      {item.statusLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
                      {item.sourceLabel}
                    </span>
                    {item.templateName ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-100">
                        Template: {item.templateName}
                      </span>
                    ) : null}
                    {item.templateKey ? (
                      <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-mono text-[11px] text-white/60">
                        {item.templateKey}
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-white">
                      {item.subject}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {item.contactLabel}
                      {item.contactValue ? ` · ${item.contactValue}` : ""}
                    </div>
                  </div>

                  {item.channel === NotificationChannel.EMAIL && item.bodyHtml ? (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                      <div dangerouslySetInnerHTML={{ __html: item.bodyHtml }} />
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                        {item.bodyText}
                      </div>

                      {item.cta ? (
                        <div className="mt-3">
                          <a
                            href={item.cta.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
                          >
                            {item.cta.label}
                          </a>
                          <div className="mt-2 break-all text-xs text-emerald-300">
                            {item.cta.url}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}

                  <div className="text-xs text-white/45">
                    {formatUkDateTime(item.occurredAt)}
                  </div>

                  {item.failureReason ? (
                    <div className="text-xs text-red-300">
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
