// ========================================
// File: src/app/(admin)/admin/messages/referees/[id]/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { NotificationRecipientSourceType, UserRole } from "@prisma/client";

import AdminMessageThread from "@/components/admin/messages/AdminMessageThread";
import LinkedRoleLinks from "@/components/admin/people/LinkedRoleLinks";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string; error?: string; thread?: string }>;
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
  if (!text) return "No preview available yet.";
  return text.length > 130 ? `${text.slice(0, 127)}...` : text;
}

function savedMessage(saved?: string) {
  if (saved === "email") return "Email queued through central Communications.";
  if (saved === "sms") return "SMS queued through central Communications.";
  return null;
}

function threadTitle(thread: {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  recipient: { displayName: string | null; email: string | null; phone: string | null } | null;
}) {
  return (
    thread.contactName ||
    thread.contactEmail ||
    thread.recipient?.displayName ||
    thread.recipient?.email ||
    thread.contactPhone ||
    thread.emailNormalized ||
    thread.phoneNormalized ||
    "Referee conversation"
  );
}

function serialiseThread(thread: Awaited<ReturnType<typeof getRefereeThreads>>[number] | null) {
  if (!thread) return null;

  return {
    id: thread.id,
    channel: thread.channel,
    status: thread.status,
    contactName: thread.contactName,
    contactPhone: thread.contactPhone,
    phoneNormalized: thread.phoneNormalized,
    contactEmail: thread.contactEmail,
    emailNormalized: thread.emailNormalized,
    replyAddress: thread.replyAddress,
    unreadForAdminCount: thread.unreadForAdminCount,
    latestMessageAt: thread.latestMessageAt?.toISOString() ?? null,
    latestInboundAt: thread.latestInboundAt?.toISOString() ?? null,
    latestOutboundAt: thread.latestOutboundAt?.toISOString() ?? null,
    team: thread.team
      ? {
          id: thread.team.id,
          name: thread.team.name,
          logoUrl: thread.team.logoUrl,
        }
      : null,
    league: thread.league
      ? {
          id: thread.league.id,
          name: thread.league.name,
          season: thread.league.season,
          slug: thread.league.slug ?? "",
        }
      : null,
    recipient: thread.recipient
      ? {
          id: thread.recipient.id,
          displayName: thread.recipient.displayName,
          phone: thread.recipient.phone,
          email: thread.recipient.email,
          audience: thread.recipient.audience,
          sourceType: thread.recipient.sourceType,
        }
      : null,
    messages: thread.messages.map((message) => ({
      id: message.id,
      channel: message.channel,
      direction: message.direction,
      participantRole: message.participantRole,
      body: message.body,
      htmlBody: message.htmlBody,
      subject: message.subject,
      fromNumber: message.fromNumber,
      toNumber: message.toNumber,
      fromEmail: message.fromEmail,
      toEmail: message.toEmail,
      providerStatus: message.providerStatus,
      sentAt: message.sentAt?.toISOString() ?? null,
      receivedAt: message.receivedAt?.toISOString() ?? null,
      readAt: message.readAt?.toISOString() ?? null,
      createdAt: message.createdAt.toISOString(),
      dispatch: message.dispatch
        ? {
            id: message.dispatch.id,
            template: message.dispatch.template,
            metadata: message.dispatch.metadata,
          }
        : null,
    })),
  };
}

async function getRefereeThreads(refereeId: string) {
  return prisma.messageThread.findMany({
    where: {
      OR: [
        { sourceType: "REFEREE", sourceId: refereeId },
        {
          recipient: {
            sourceType: NotificationRecipientSourceType.REFEREE,
            sourceId: refereeId,
          },
        },
      ],
    },
    orderBy: [{ latestMessageAt: "desc" }, { updatedAt: "desc" }],
    include: {
      recipient: true,
      team: { select: { id: true, name: true, logoUrl: true } },
      league: { select: { id: true, name: true, season: true, slug: true } },
      messages: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          dispatch: {
            select: {
              id: true,
              metadata: true,
              template: {
                select: {
                  id: true,
                  name: true,
                  key: true,
                },
              },
            },
          },
        },
      },
    },
  });
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

  const [profileRows, sourceLead, messageThreads] = await Promise.all([
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
    getRefereeThreads(referee.id),
  ]);

  const phone = profileRows[0]?.phone || sourceLead?.phone || null;
  const notice = savedMessage(sp.saved);
  const error = sp.error ? decodeURIComponent(sp.error) : null;
  const displayName = referee.name?.trim() || referee.email || "Referee";
  const selectedThread =
    messageThreads.find((thread) => thread.id === sp.thread) ?? messageThreads[0] ?? null;
  const selectedThreadForClient = serialiseThread(selectedThread);

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
              This page uses the same message-thread timeline as the main Communications inbox. New replies should be sent from the thread panel, not from a separate referee-only send form.
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

      <LinkedRoleLinks userId={referee.id} current="referee" />

      {messageThreads.length === 0 ? (
        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 sm:p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">No thread yet</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Start with the referee welcome email</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/75">
            Send the welcome email from the referee profile. That creates the normal Communications thread, then all later email/SMS replies can be handled from the proper timeline here.
          </p>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">History</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Proper comms timeline</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              This is the same message-thread view used by the main Communications inbox.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">
            {messageThreads.length} thread{messageThreads.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Threads</h3>
            {messageThreads.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/55">
                No message thread yet.
              </p>
            ) : (
              messageThreads.map((thread) => {
                const selected = selectedThread?.id === thread.id;
                const latest = thread.messages[thread.messages.length - 1];

                return (
                  <Link
                    key={thread.id}
                    href={`/admin/messages/referees/${referee.id}?thread=${thread.id}`}
                    className={`block rounded-2xl border p-4 transition ${
                      selected
                        ? "border-emerald-400/30 bg-emerald-400/10"
                        : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{thread.channel}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">{thread.status}</span>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-white">{threadTitle(thread)}</div>
                    <div className="mt-1 text-xs text-white/45">Latest {formatDate(thread.latestMessageAt ?? thread.updatedAt)}</div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-white/60">{preview(latest?.textBody ?? latest?.body)}</p>
                  </Link>
                );
              })
            )}
          </div>

          <AdminMessageThread selectedFilter="all" thread={selectedThreadForClient as never} />
        </div>
      </section>
    </div>
  );
}
