"use client";

import { useFormStatus } from "react-dom";

type Props = {
  refereeId: string;
  email: string | null;
  action: (formData: FormData) => Promise<void>;
};

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Queueing email…" : "Send new email"}
    </button>
  );
}

export default function NewEmailForm({ refereeId, email, action }: Props) {
  const canSend = Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return (
    <form action={action} aria-label="New referee email" className="space-y-5">
      <input type="hidden" name="refereeId" value={refereeId} />
      <div>
        <label htmlFor="new-referee-email-to" className="block text-sm font-semibold text-white/80">To</label>
        <input
          id="new-referee-email-to"
          type="text"
          readOnly
          value={email || "No email address saved"}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70"
        />
        <p className="mt-2 text-xs text-white/50">The recipient is taken from this referee’s saved profile.</p>
      </div>
      <div>
        <label htmlFor="new-referee-email-subject" className="block text-sm font-semibold text-white/80">Subject</label>
        <input
          id="new-referee-email-subject"
          name="subject"
          type="text"
          required
          maxLength={200}
          disabled={!canSend}
          placeholder="Enter a new subject"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40 disabled:opacity-40"
        />
      </div>
      <div>
        <label htmlFor="new-referee-email-body" className="block text-sm font-semibold text-white/80">Message</label>
        <textarea
          id="new-referee-email-body"
          name="body"
          required
          rows={10}
          maxLength={20000}
          disabled={!canSend}
          placeholder="Write your new message…"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-emerald-400/40 disabled:opacity-40"
        />
      </div>
      {!canSend ? <p role="alert" className="text-sm text-amber-100">Add a valid email address to the referee’s profile before sending.</p> : null}
      <SendButton disabled={!canSend} />
      <p className="text-xs leading-5 text-white/50">This queues a new email with the subject above, not a reply or a resend. It will appear in the referee’s Communications history.</p>
    </form>
  );
}
