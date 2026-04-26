// ========================================
// File: src/app/(admin)/admin/messaging/queued-sms/page.tsx
// ========================================

import Link from "next/link";
import { NotificationDispatchStatus } from "@prisma/client";

import { cancelQueuedSmsMessageAction } from "@/app/(admin)/admin/messages/actions";
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

function formatPhone(value: string | null | undefined) {
  if (!value) return "—";

  if (value.startsWith("+44") && value.length === 13) {
    const local = `0${value.slice(3)}`;
    return `${local.slice(0, 5)} ${local.slice(5, 8)} ${local.slice(8)}`;
  }

  return value;
}

export default async function QueuedSmsPage() {
  await requireAdmin();

  const messages = await prisma.messageEntry.findMany({
    where: {
      channel: "SMS",
      direction: "OUTBOUND",
      notificationDispatchId: {
        not: null,
      },
      dispatch: {
        status: NotificationDispatchStatus.QUEUED,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      dispatch: {
        select: {
          id: true,
          status: true,
          scheduledFor: true,
          failureReason: true,
          template: {
            select: {
              name: true,
              key: true,
            },
          },
        },
      },
      thread: {
        select: {
          id: true,
          contactName: true,
          contactPhone: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          recipient: {
            select: {
              displayName: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/admin/messaging"
            className="text-sm text-emerald-300 hover:text-emerald-200"
          >
            ← Back to messaging
          </Link>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
            SMS queue
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
            Queued SMS messages
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            These SMS messages have been queued but have not yet been sent. You can cancel them before the notification worker processes them.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-amber-100">
          <div className="text-xs uppercase tracking-[0.16em] text-amber-100/70">
            Queued
          </div>
          <div className="mt-1 text-3xl font-semibold text-white">
            {messages.length}
          </div>
        </div>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        {messages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/55">
            No queued SMS messages found.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => {
              const contactName =
                message.thread.contactName ||
                message.thread.recipient?.displayName ||
                message.thread.team?.name ||
                "Unknown contact";
              const toNumber =
                message.toNumber ||
                message.thread.contactPhone ||
                message.thread.recipient?.phone ||
                null;

              return (
                <div
                  key={message.id}
                  className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-white">
                        {contactName}
                      </div>
                      <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-100">
                        QUEUED
                      </span>
                      {message.dispatch?.template ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">
                          {message.dispatch.template.name}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs text-white/45">
                      To: {formatPhone(toNumber)} · Queued: {formatDateTime(message.createdAt)} · Scheduled: {formatDateTime(message.dispatch?.scheduledFor)}
                    </div>

                    {message.thread.team ? (
                      <div className="mt-1 text-xs text-white/45">
                        Team: {message.thread.team.name}
                      </div>
                    ) : null}

                    <div className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-white/75">
                      {message.body}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Link
                      href={`/admin/messaging?thread=${message.thread.id}&filter=all`}
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]"
                    >
                      Open thread
                    </Link>

                    <form action={cancelQueuedSmsMessageAction}>
                      <input type="hidden" name="messageId" value={message.id} />
                      <input type="hidden" name="threadId" value={message.thread.id} />
                      <input type="hidden" name="filter" value="all" />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15"
                      >
                        Cancel SMS
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
