import Link from "next/link";

import {
  getAdminAppMessagingDashboard,
  getAdminInternalChatConversations,
} from "@/lib/admin/app-messaging";
import { formatDateTimeInLondon } from "@/lib/datetime/london";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Chat | SIXFL Admin",
};

function formatActivity(value: Date | null) {
  if (!value) return "No messages yet";

  return formatDateTimeInLondon(value, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminChatPage() {
  await requireAdmin();

  const [conversations, dashboard] = await Promise.all([
    getAdminInternalChatConversations(),
    getAdminAppMessagingDashboard(12, 12),
  ]);

  const sixflConversations = conversations.filter(
    (conversation) => conversation.conversationType === "SIXFL",
  );
  const squadConversations = conversations.filter(
    (conversation) => conversation.conversationType !== "SIXFL",
  );

  return (
    <div className="w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                App chat
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Chat
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 md:text-base">
                SIXFL app conversations only. Messages sent directly to SIXFL stay separate from normal squad chat.
              </p>
            </div>

            <Link
              href="/admin/messaging"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Open Comms
            </Link>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Messages to SIXFL
              </div>
              <div className={`mt-2 text-2xl font-semibold ${dashboard.sixflSupportNeedsReplyCount > 0 ? "text-amber-200" : "text-white"}`}>
                {dashboard.sixflSupportNeedsReplyCount}
              </div>
              <div className="mt-1 text-xs text-white/40">need reply</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                App messages · 24h
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {dashboard.messagesLast24Hours}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Notifications enabled
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {dashboard.notificationUsers}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Active devices
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {dashboard.activePushDevices}
              </div>
            </div>
          </div>
        </section>

        <section
          id="sixfl-inbox"
          className={`overflow-hidden rounded-3xl border shadow-[0_18px_60px_rgba(0,0,0,0.24)] ${
            dashboard.sixflSupportNeedsReplyCount > 0
              ? "border-amber-400/25 bg-amber-500/[0.04]"
              : "border-emerald-400/15 bg-emerald-500/[0.025]"
          }`}
        >
          <div className="border-b border-white/10 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300/75">
                  SIXFL inbox
                </div>
                <h2 className="mt-1 text-xl font-semibold text-white">Messages to SIXFL</h2>
                <p className="mt-1 text-sm text-white/45">
                  Direct player and captain messages that need SIXFL rather than their squad.
                </p>
              </div>
              {dashboard.sixflSupportNeedsReplyCount > 0 ? (
                <span className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1.5 text-xs font-black text-amber-100">
                  {dashboard.sixflSupportNeedsReplyCount} need reply
                </span>
              ) : (
                <span className="inline-flex w-fit items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-100">
                  Up to date
                </span>
              )}
            </div>
          </div>

          {sixflConversations.length > 0 ? (
            <div className="divide-y divide-white/10">
              {sixflConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">
                        {conversation.participantName || "SIXFL user"}
                      </span>
                      <span className="text-xs text-white/40">{conversation.teamName}</span>
                      {conversation.needsReply ? (
                        <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-100">
                          Needs reply
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-400/15 bg-emerald-500/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100/80">
                          Replied
                        </span>
                      )}
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/70">
                      {conversation.lastMessagePreview?.trim() || "No messages in this conversation yet."}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
                      <span>{conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}</span>
                      <span>Latest: {formatActivity(conversation.latestMessageAt)}</span>
                    </div>
                  </div>

                  <Link
                    href={conversation.href}
                    className={`inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-semibold transition ${
                      conversation.needsReply
                        ? "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15"
                        : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
                    }`}
                  >
                    Open SIXFL message
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-10 text-center text-sm text-white/45">
              No one has messaged SIXFL through the app yet.
            </div>
          )}
        </section>

        <details className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025] shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 md:px-6 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-xl font-semibold text-white">Squad chat monitor</h2>
              <p className="mt-1 text-sm text-white/45">
                Whole Squad Chat, Regulars, selected groups and private teammate/captain chats.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55">
                {squadConversations.length} conversations
              </span>
              <span className="text-xl text-white/40 transition group-open:rotate-45">+</span>
            </div>
          </summary>

          <div className="border-t border-white/10">
            {squadConversations.length > 0 ? (
              <div className="divide-y divide-white/10">
                {squadConversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="grid gap-4 px-5 py-4 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-6"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{conversation.teamName}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">
                          {conversation.conversationLabel}
                        </span>
                      </div>

                      <p className="mt-2 line-clamp-2 text-sm leading-5 text-white/65">
                        {conversation.lastMessagePreview?.trim() || "No messages in this conversation yet."}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/35">
                        <span>{conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"}</span>
                        <span>Latest: {formatActivity(conversation.latestMessageAt)}</span>
                      </div>
                    </div>

                    <Link
                      href={conversation.href}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      Open chat
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-white/45">
                No squad conversations have been created yet.
              </div>
            )}
          </div>
        </details>

        <details className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-base font-semibold text-white">Push notification audit</h2>
              <p className="mt-1 text-xs text-white/40">Device delivery and notification taps.</p>
            </div>
            <span className="text-xl text-white/40 transition group-open:rotate-45">+</span>
          </summary>
          <div className="divide-y divide-white/10 border-t border-white/10">
            {dashboard.pushAudit.length > 0 ? (
              dashboard.pushAudit.map((item) => (
                <Link key={item.id} href={item.href} className="block px-5 py-3 hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{item.recipientName}</div>
                      <div className="mt-0.5 text-xs text-white/45">{item.title}</div>
                      <div className="mt-1 line-clamp-1 text-xs text-white/55">{item.body}</div>
                    </div>
                    <span className="shrink-0 text-[10px] text-white/35">{item.statusLabel}</span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-5 py-5 text-sm text-white/40">No push attempts yet.</div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
