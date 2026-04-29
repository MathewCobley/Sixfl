// ========================================
// File: src/components/player/PlayerMessageBox.tsx
// ========================================

"use client";

import { FormEvent, useState } from "react";

type PlayerMessageBoxProps = {
  teamId: string;
};

export default function PlayerMessageBox({ teamId }: PlayerMessageBoxProps) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = message.trim();

    if (trimmed.length < 3) {
      setStatus("error");
      setFeedback("Please type a short message first.");
      return;
    }

    setStatus("sending");
    setFeedback(null);

    try {
      const response = await fetch(`/api/player/team/${teamId}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Could not send message.");
      }

      setMessage("");
      setStatus("sent");
      setFeedback("Message sent to SIXFL. We’ll reply as soon as we can.");
    } catch (error) {
      setStatus("error");
      setFeedback(error instanceof Error ? error.message : "Could not send message.");
    }
  }

  return (
    <section
      id="message-sixfl"
      className="mx-auto mb-8 w-full max-w-6xl px-4 text-white sm:px-0"
    >
      <div className="rounded-3xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),rgba(255,255,255,0.04)] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.3)]">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
              Message SIXFL
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              Need help with fixtures, availability, or fees?
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Send a message from your player dashboard. It appears in the SIXFL admin inbox so we can reply and keep the conversation tracked.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="Example: I can only make kick-off after 8pm this week, is that okay?"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-emerald-400/50 focus:bg-black/40"
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-white/45">
                {message.length}/1200 characters
              </div>
              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "sending" ? "Sending..." : "Send message"}
              </button>
            </div>

            {feedback ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  status === "error"
                    ? "border-red-400/20 bg-red-500/10 text-red-100"
                    : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                }`}
              >
                {feedback}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
