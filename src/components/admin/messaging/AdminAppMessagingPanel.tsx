import Link from "next/link";

import type {
  AdminAppMessagingDashboard,
  AdminAppMessageActivity,
  AdminPushAuditItem,
} from "@/lib/admin/app-messaging";

function relativeTime(value: Date) {
  const diffMs = Date.now() - value.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusClasses(
  tone:
    | AdminAppMessageActivity["pushTone"]
    | AdminPushAuditItem["statusTone"],
) {
  if (tone === "opened") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  }
  if (tone === "shown") {
    return "border-sky-400/25 bg-sky-500/10 text-sky-200";
  }
  if (tone === "suppressed") {
    return "border-violet-400/25 bg-violet-500/10 text-violet-200";
  }
  if (tone === "disabled") {
    return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  }
  if (tone === "pending") {
    return "border-white/15 bg-white/[0.05] text-white/60";
  }

  return "border-white/10 bg-black/20 text-white/40";
}

function deviceSummary(userAgent: string | null) {
  if (!userAgent) return null;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Macintosh|Mac OS/i.test(userAgent)) return "Mac";
  return "Device";
}

export default function AdminAppMessagingPanel({
  data,
}: {
  data: AdminAppMessagingDashboard;
}) {
  return (
    <section
      id="app-messaging"
      className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),rgba(255,255,255,0.025)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] md:p-6"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
              App messaging
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100">
              Dark launch
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Whole Squad Chat control centre
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Monitor app conversations and push delivery while Whole Squad Chat remains hidden from normal player and captain navigation.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-xs leading-5 text-white/40">
            SMS and email remain unchanged during the pilot.
          </div>
          <Link
            href="/admin/chat"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Open Chat
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            App conversations
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {data.totalConversations}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Messages · 24h
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {data.messagesLast24Hours}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Notifications enabled
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {data.notificationUsers}
          </div>
          <div className="mt-1 text-xs text-white/40">people</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
            Active devices
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {data.activePushDevices}
          </div>
        </div>
      </div>

      <div
        className={`mt-6 overflow-hidden rounded-2xl border ${
          data.sixflSupportNeedsReplyCount > 0
            ? "border-amber-400/25 bg-amber-500/[0.05]"
            : "border-emerald-400/15 bg-emerald-500/[0.035]"
        }`}
      >
        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300/75">
              SIXFL inbox
            </div>
            <h3 className="mt-1 text-base font-semibold text-white">Messages to SIXFL</h3>
            <p className="mt-1 text-xs leading-5 text-white/40">
              Direct messages to SIXFL are kept separate from squad chat.
            </p>
          </div>
          <Link
            href="/admin/chat#sixfl-inbox"
            className={`inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-bold ${
              data.sixflSupportNeedsReplyCount > 0
                ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {data.sixflSupportNeedsReplyCount > 0
              ? `${data.sixflSupportNeedsReplyCount} need reply`
              : "Open SIXFL inbox"}
          </Link>
        </div>

        {data.sixflSupportMessages.length > 0 ? (
          <div className="divide-y divide-white/10">
            {data.sixflSupportMessages.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-start justify-between gap-4 px-4 py-3 transition hover:bg-white/[0.04]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">
                      {item.participantName}
                    </span>
                    <span className="text-xs text-white/35">{item.teamName}</span>
                    {item.needsReply ? (
                      <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-100">
                        New · needs reply
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-white/50">
                    {item.lastMessagePreview || "No message preview"}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-white/30">
                  {item.latestMessageAt ? relativeTime(item.latestMessageAt) : ""}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-4 py-5 text-sm text-white/40">
            No direct messages to SIXFL yet.
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">
                Squad chat activity
              </h3>
              <p className="mt-1 text-xs text-white/40">
                Whole Squad, Regulars, selected groups and private squad conversations. Messages to SIXFL are listed separately above.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
            {data.recentMessages.length > 0 ? (
              <div className="divide-y divide-white/10">
                {data.recentMessages.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block p-4 transition hover:bg-white/[0.04]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {item.teamName}
                        </div>
                        <div className="mt-0.5 text-xs text-white/45">
                          {item.senderName} · {item.conversationLabel}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-white/35">
                        {relativeTime(item.createdAt)}
                      </div>
                    </div>

                    <p className="mt-2 text-sm leading-5 text-white/70">
                      {item.body}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "rounded-full border px-2 py-1 text-[10px] font-bold",
                          statusClasses(item.pushTone),
                        ].join(" ")}
                      >
                        {item.pushLabel}
                      </span>
                      <span
                        className={[
                          "rounded-full border px-2 py-1 text-[10px] font-bold",
                          item.unreadRecipientCount > 0
                            ? "border-amber-400/20 bg-amber-500/10 text-amber-100"
                            : "border-white/10 bg-white/[0.03] text-white/40",
                        ].join(" ")}
                      >
                        {item.unreadRecipientCount > 0
                          ? `Unread by ${item.unreadRecipientCount}`
                          : "Read"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-white/40">
                No app messages yet. This will populate during admin testing and the pilot.
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-3">
            <h3 className="text-base font-semibold text-white">
              Push notification audit
            </h3>
            <p className="mt-1 text-xs text-white/40">
              Real device receipts: shown, already-open suppression and notification taps.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
            {data.pushAudit.length > 0 ? (
              <div className="divide-y divide-white/10">
                {data.pushAudit.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block p-4 transition hover:bg-white/[0.04]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {item.recipientName}
                        </div>
                        <div className="mt-0.5 text-xs text-white/45">
                          {item.title}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-white/35">
                        {relativeTime(item.createdAt)}
                      </div>
                    </div>

                    <p className="mt-2 text-sm leading-5 text-white/65">
                      {item.body}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "rounded-full border px-2 py-1 text-[10px] font-bold",
                          statusClasses(item.statusTone),
                        ].join(" ")}
                      >
                        {item.statusLabel}
                      </span>
                      {deviceSummary(item.deviceLabel) ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-bold text-white/40">
                          {deviceSummary(item.deviceLabel)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-white/40">
                No push attempts yet. Nothing is being sent to phones unless a user has opted in and the message qualifies.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
