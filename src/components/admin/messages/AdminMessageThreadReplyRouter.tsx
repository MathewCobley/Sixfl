// ========================================
// File: src/components/admin/messages/AdminMessageThreadReplyRouter.tsx
// ========================================

"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

import { sendAdminEmailReplyAction } from "@/app/(admin)/admin/messages/email-reply-actions";
import AdminMessageThread from "@/components/admin/messages/AdminMessageThread";

type SelectedThread = React.ComponentProps<typeof AdminMessageThread>["thread"];

type Props = {
  selectedFilter: "unread" | "open" | "archived" | "all";
  thread: SelectedThread;
};

function ReplyButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/40"
    >
      {pending ? "Sending..." : "Send email reply"}
    </button>
  );
}

export default function AdminMessageThreadReplyRouter({ selectedFilter, thread }: Props) {
  const replyEmail = thread
    ? (thread.contactEmail || thread.recipient?.email || thread.emailNormalized || "").trim()
    : "";
  const showEmailReply = Boolean(thread && thread.channel === "EMAIL");
  const canReply = Boolean(showEmailReply && replyEmail && thread?.status === "OPEN");

  return (
    <div className="space-y-4">
      {thread ? (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/[0.06] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
                Thread tools
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">
                Wrong team showing?
              </h3>
              <p className="mt-1 text-sm leading-6 text-white/60">
                Move this conversation to the correct team, or unlink it from the old team without deleting messages.
              </p>
            </div>
            <Link
              href={`/admin/messaging/reassign/${thread.id}?filter=${selectedFilter}`}
              className="inline-flex items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15"
            >
              Reassign / unlink thread
            </Link>
          </div>
        </div>
      ) : null}

      {showEmailReply ? (
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
          <h3 className="text-lg font-semibold text-white">Reply by email</h3>
          <p className="mt-2 text-sm leading-6 text-white/60">
            This is an email conversation. Replies from this box go back by email and stay in this timeline.
          </p>

          <form action={sendAdminEmailReplyAction} className="mt-4 space-y-4">
            <input type="hidden" name="threadId" value={thread?.id ?? ""} />
            <input type="hidden" name="filter" value={selectedFilter} />
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
              {canReply ? `Replying to ${replyEmail}` : "Email reply unavailable for this thread."}
            </div>
            <textarea
              name="body"
              rows={5}
              disabled={!canReply}
              placeholder={canReply ? "Type your email reply here..." : "Email reply unavailable"}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400/40 focus:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
            />
            <ReplyButton disabled={!canReply} />
          </form>
        </div>
      ) : null}

      <AdminMessageThread selectedFilter={selectedFilter} thread={thread} />
    </div>
  );
}
