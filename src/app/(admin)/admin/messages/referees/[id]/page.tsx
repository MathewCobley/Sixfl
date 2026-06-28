// ========================================
// File: src/app/(admin)/admin/messages/referees/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationRecipientSourceType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  sendCentralRefereeEmailAction,
  sendCentralRefereeSmsAction,
} from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; error?: string }>;
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function preview(value: string | null | undefined) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function savedMessage(saved?: string) {
  if (saved === "email") return "Email queued through central Communications.";
  if (saved === "sms") return "SMS queued through central Communications.";
  return null;
}

export default async function CentralRefereeCommsPage({ params, searchParams }: PageProps) {
  await requireAdmin();

  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const referee = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdFromLeadId: true,
    },
  });

  if (!referee || referee.role !== UserRole.REFEREE) {
    notFound();
  }

  const [profileRows, sourceLead, dispatches, messageThreads] = await Promise.all([
    prisma.$queryRaw<Array<{ phone: string | null }>>`
      SELECT "phone"
      FROM "RefereeProfile"
      WHERE "userId" = ${referee.id}
      LIMIT 1
    `.catch(() => []),
    referee.createdFromLeadId
      ? prisma.interestLead.findUnique({
          where: { id: referee.createdFromLeadId },
          select: { phone: true },
        })
      : null,
    prisma.notificationDispatch.findMany({
      where: {
        OR: [
          { sourceType: "REFEREE", sourceId: referee.id },
          { sourceType: "REFEREE_INVITE", sourceId: referee.id },
          {
            recipient: {
              sourceType: NotificationRecipientSourceType.REFEREE,
              sourceId: referee.id,
            },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
      include: {
        template: { select: { name: true, key: true } },
      },
    }),
    prisma.messageThread.findMany({
      where: {
        OR: [
          { sourceType: "REFEREE", sourceId: referee.id },
          {
            recipient: {
              sourceType: NotificationRecipientSourceType.REFEREE,
              sourceId: referee.id,
            },
          },
        ],
      },
      orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 6,
      include: {
        messages: {
          orderBy: [{ createdAt: "desc" }],
          take: 3,
        },
      },
    }),
  ]);

  const phone = profileRows[0]?.phone || sourceLead?.phone || null;
  const notice = savedMessage(sp.saved);
  const error = sp.error ? decodeURIComponent(sp.error) : null;
  const displayName = referee.name?.trim() || referee.email || "Referee";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.14),transparent_32%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href={`/admin/referees/${referee.id}`} className="text-sm font-medium text-emerald-300 transition hover:text-emerald-200">
              ← Back to referee profile
            </Link>
            <div className="mt-4 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Central Communications
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Referee comms: {displayName}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
              Send email or SMS through the shared SIXFL Communications system. This keeps queue records, message threads and history in one place.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            <div><span className="text-white/40">Email:</span> {referee.email || "—"}</div>
            <div className="mt-1"><span className="text-white/40">SMS:</span> {phone || "—"}</div>
          </div>
        </div>
      </section>

      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
      {error ? <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <form action={sendCentralRefereeEmailAction} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <input type="hidden" name="refereeId" value={referee.id} />
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Email</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Send referee email</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">Queued through the shared notification and inbox system.</p>

          <label className="mt-5 block text-sm font-semibold text-white/75">
            Subject
            <input name="subject" required placeholder="Subject" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/35" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-white/75">
            Body
            <textarea name="body" required rows={8} placeholder="Write your email..." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
          </label>
          <button type="submit" className="mt-4 inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-bold text-black transition hover:bg-emerald-300">
            Queue email
          </button>
        </form>

        <form action={sendCentralRefereeSmsAction} className="rounded-3xl border border-sky-400/20 bg-sky-400/10 p-5 sm:p-6">
          <input type="hidden" name="refereeId" value={referee.id} />
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">SMS</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Send referee SMS</h2>
          <p className="mt-2 text-sm leading-6 text-sky-50/65">Queued through the shared notification and inbox system.</p>

          <label className="mt-5 block text-sm font-semibold text-white/75">
            Message
            <textarea name="body" required rows={8} placeholder="Write your SMS..." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35" />
          </label>
          <button type="submit" className="mt-4 inline-flex h-12 items-center justify-center rounded-2xl bg-sky-300 px-5 text-sm font-bold text-black transition hover:bg-sky-200">
            Queue SMS
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">History</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Central comms history</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
            {dispatches.length} dispatch{dispatches.length === 1 ? "" : "es"} · {messageThreads.length} thread{messageThreads.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Notification queue</h3>
            {dispatches.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/55">No queued email or SMS yet.</p> : null}
            {dispatches.map((dispatch) => (
              <article key={dispatch.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{dispatch.channel}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{dispatch.status}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-white">{dispatch.subject || dispatch.template?.name || "Message"}</div>
                <div className="mt-1 text-xs text-white/45">Queued {formatDate(dispatch.createdAt)}{dispatch.sentAt ? ` · Sent ${formatDate(dispatch.sentAt)}` : ""}</div>
                <p className="mt-3 text-sm leading-6 text-white/65">{preview(dispatch.bodyText)}</p>
                {dispatch.failureReason ? <p className="mt-2 text-xs text-red-200">{dispatch.failureReason}</p> : null}
              </article>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Message threads</h3>
            {messageThreads.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/55">No message thread yet.</p> : null}
            {messageThreads.map((thread) => (
              <article key={thread.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{thread.channel}</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{thread.status}</span>
                </div>
                <div className="mt-3 text-sm font-semibold text-white">{thread.contactName || thread.contactEmail || thread.contactPhone || displayName}</div>
                <div className="mt-1 text-xs text-white/45">Latest {formatDate(thread.latestMessageAt ?? thread.updatedAt)}</div>
                {thread.messages.map((message) => (
                  <div key={message.id} className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-white/40">{message.direction} · {formatDate(message.createdAt)}</div>
                    <p className="mt-2 text-sm leading-6 text-white/65">{preview(message.textBody ?? message.body)}</p>
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
