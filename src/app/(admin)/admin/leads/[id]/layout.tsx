// ========================================
// File: src/app/(admin)/admin/leads/[id]/layout.tsx
// ========================================

import Link from "next/link";
import { NotificationChannel } from "@prisma/client";
import type { ReactNode } from "react";

import CommunicationStatusBadge, {
  CommunicationStatusExplanation,
} from "@/components/admin/communications/CommunicationStatusBadge";
import CancelQueuedSmsButton from "@/components/admin/messages/CancelQueuedSmsButton";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function getOriginLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "Communication";
  }

  const value = (metadata as Record<string, unknown>).originLabel;

  return typeof value === "string" && value.trim() ? value.trim() : "Communication";
}

export default async function AdminLeadLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;

  const threads = await prisma.messageThread.findMany({
    where: {
      sourceType: "LEAD",
      sourceId: id,
    },
    include: {
      messages: {
        orderBy: [{ createdAt: "desc" }],
        take: 100,
        include: {
          dispatch: {
            select: {
              id: true,
              status: true,
              failureReason: true,
              scheduledFor: true,
              template: {
                select: {
                  id: true,
                  name: true,
                  key: true,
                },
              },
              metadata: true,
            },
          },
        },
      },
    },
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
  });

  const timeline = threads
    .flatMap((thread) =>
      thread.messages.map((message) => {
        const statusLabel = message.providerStatus || message.dispatch?.status || "RECORDED";
        const canCancelQueuedSms = Boolean(
          message.channel === NotificationChannel.SMS &&
            message.direction === "OUTBOUND" &&
            message.notificationDispatchId &&
            String(statusLabel).trim().toUpperCase().startsWith("QUEUED"),
        );

        return {
          id: message.id,
          threadId: thread.id,
          channel: message.channel,
          direction: message.direction,
          participantRole: message.participantRole,
          subject: message.subject,
          body: message.textBody || message.body || "",
          htmlBody: message.htmlBody,
          providerStatus: statusLabel,
          failureReason: message.dispatch?.failureReason ?? null,
          templateName: message.dispatch?.template?.name ?? null,
          templateKey: message.dispatch?.template?.key ?? null,
          originLabel: message.dispatch ? getOriginLabel(message.dispatch.metadata) : "Inbox thread",
          contactValue: message.toEmail || message.toNumber || message.fromEmail || message.fromNumber || null,
          occurredAt: message.receivedAt ?? message.sentAt ?? message.createdAt,
          scheduledFor: message.dispatch?.scheduledFor ?? null,
          canCancelQueuedSms,
        };
      }),
    )
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const queuedCount = timeline.filter((item) => item.canCancelQueuedSms).length;

  return (
    <div className="space-y-8">
      {children}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              Unified communications
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Lead communication timeline
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              SMS and central dispatch messages for this lead now appear here, using the same queued, skipped, sent, failed and cancelled rules as the rest of Communications.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {queuedCount > 0 ? (
              <Link
                href="/admin/messaging/queued-sms"
                className="inline-flex items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
              >
                {queuedCount} queued SMS
              </Link>
            ) : null}
            <Link
              href="/admin/messaging"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
            >
              Open messaging
            </Link>
          </div>
        </div>

        <div className="mt-5 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          {timeline.length === 0 ? (
            <div className="p-6 text-sm text-white/55">
              No central communication timeline entries have been logged for this lead yet.
            </div>
          ) : (
            timeline.map((item) => (
              <div key={item.id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                    {item.channel}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/70">
                    {item.direction}
                  </span>
                  <CommunicationStatusBadge status={String(item.providerStatus)} />
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                    {item.originLabel}
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
                    {item.subject || `${item.channel} message`}
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    {formatDateTime(item.occurredAt)}
                    {item.scheduledFor ? ` · Scheduled ${formatDateTime(item.scheduledFor)}` : ""}
                    {item.contactValue ? ` · ${item.contactValue}` : ""}
                  </div>
                </div>

                {item.channel === NotificationChannel.EMAIL && item.htmlBody ? (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
                    <div dangerouslySetInnerHTML={{ __html: item.htmlBody }} />
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/80">
                    {item.body}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CommunicationStatusExplanation status={String(item.providerStatus)}>
                    {item.failureReason ? `Reason: ${item.failureReason}` : undefined}
                  </CommunicationStatusExplanation>

                  {item.canCancelQueuedSms ? (
                    <CancelQueuedSmsButton
                      messageId={item.id}
                      threadId={item.threadId}
                      filter="all"
                      compact
                    />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
