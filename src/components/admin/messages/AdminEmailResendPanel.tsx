"use client";

import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";

import { resendAdminEmailAction } from "@/app/(admin)/admin/messages/actions";

type ResendableMessage = {
  id: string;
  channel: "SMS" | "EMAIL";
  direction: "INBOUND" | "OUTBOUND";
  participantRole: "ADMIN" | "CAPTAIN" | "CONTACT" | "SYSTEM";
  subject: string | null;
  toEmail: string | null;
  sentAt: string | null;
  createdAt: string;
  dispatch?: {
    status?: string;
    id: string;
  } | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/15 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Queuing…" : "Resend email"}
    </button>
  );
}

export default function AdminEmailResendPanel({
  threadId,
  selectedFilter,
  messages,
}: {
  threadId: string;
  selectedFilter: "unread" | "open" | "archived" | "all";
  messages: ResendableMessage[];
}) {
  const searchParams = useSearchParams();
  const resendable = messages
    .filter(
      (message) =>
        message.channel === "EMAIL" &&
        message.direction === "OUTBOUND" &&
        message.participantRole === "ADMIN" &&
        Boolean(message.sentAt) &&
        Boolean(message.toEmail?.trim()),
    )
    .sort(
      (a, b) =>
        new Date(b.sentAt || b.createdAt).getTime() -
        new Date(a.sentAt || a.createdAt).getTime(),
    );

  if (!resendable.length) return null;

  const error = searchParams.get("error");
  const statusMessage = searchParams.get("resent") === "1"
    ? { tone: "success", text: "Email queued to resend. The original message is unchanged, and a new timeline entry will appear after delivery." }
    : searchParams.get("resend_existing") === "1"
      ? { tone: "info", text: "That email was already queued or resent recently, so no duplicate send was created." }
      : error === "email_resend_confirmation"
        ? { tone: "error", text: "Confirm the resend before queuing the email." }
        : error === "email_resend_unavailable"
          ? { tone: "error", text: "That message cannot be resent from this thread. Only a successfully sent admin email can be resent." }
          : error === "email_resend_blocked"
            ? { tone: "error", text: "The email was not queued. The saved recipient address or notification permissions may have changed; send a new email instead if needed." }
            : null;

  return (
    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <h3 className="text-lg font-semibold text-white">Resend a sent email</h3>
      <p className="mt-2 text-sm leading-6 text-white/60">
        Resend the exact saved email to the same current recipient. The original record stays untouched and the resend is recorded separately.
      </p>

      {statusMessage ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            statusMessage.tone === "error"
              ? "border-rose-400/25 bg-rose-500/10 text-rose-100"
              : statusMessage.tone === "info"
                ? "border-sky-400/25 bg-sky-500/10 text-sky-100"
                : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {statusMessage.text}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {resendable.map((message, index) => (
          <details
            key={message.id}
            open={index === 0}
            className="rounded-2xl border border-white/10 bg-black/20"
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white/80">
              {message.subject || "Sent email"} · {formatDateTime(message.sentAt || message.createdAt)}
            </summary>
            <form action={resendAdminEmailAction} className="space-y-3 border-t border-white/10 p-4">
              <input type="hidden" name="messageId" value={message.id} />
              <input type="hidden" name="threadId" value={threadId} />
              <input type="hidden" name="filter" value={selectedFilter} />
              <p className="break-all text-sm text-white/65">
                To: <strong className="text-white/85">{message.toEmail}</strong>
              </p>
              <label className="flex items-start gap-2 text-sm text-white/65">
                <input type="checkbox" name="confirmed" required className="mt-1" />
                <span>I have checked the recipient and want to resend this exact email.</span>
              </label>
              <ResendButton />
            </form>
          </details>
        ))}
      </div>
    </section>
  );
}
