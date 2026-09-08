"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AnnouncementProgress, AnnouncementReview } from "@/lib/communications/announcement-queue";

type Phase = "idle" | "queueing" | "complete" | "uncertain" | "checked";
function isProgress(value: unknown, sourceId: string): value is AnnouncementProgress {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.sourceId === sourceId && typeof row.checkedAt === "string" &&
    ["total", "recorded", "remaining", "queued", "processing", "sent", "failed", "skipped", "cancelled"].every((key) => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0);
}

export default function AnnouncementSendPanel({ review, initialProgress, compatible }: {
  review: AnnouncementReview; initialProgress: AnnouncementProgress; compatible: boolean;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [phase, setPhase] = useState<Phase>("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [reviewChanged, setReviewChanged] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const reading = useRef(false);
  const mounted = useRef(true);
  const submission = useRef<AbortController | null>(null);
  const readController = useRef<AbortController | null>(null);
  const startedAt = useRef(Date.now());
  const { templateId, sourceId, audienceKey } = review;
  const statusUrl = `/api/admin/announcements?${new URLSearchParams({ templateId, sourceId, audienceKey })}`;
  const queueUrl = `/admin/queue?${new URLSearchParams({ filter: "all", q: sourceId })}`;
  const updateProgress = useCallback((next: AnnouncementProgress) => {
    setProgress((previous) => next.checkedAt >= previous.checkedAt ? next : previous);
  }, []);

  const checkProgress = useCallback(async (manual = false) => {
    if (reading.current) return;
    reading.current = true;
    if (manual) setChecking(true);
    const controller = new AbortController();
    readController.current = controller;
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(statusUrl, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.ok !== true || !isProgress(result.progress, sourceId)) throw new Error("Status unavailable");
      if (!mounted.current) return;
      updateProgress(result.progress);
      setReviewChanged(result.reviewChanged === true);
      setReadError("");
      if (manual && !busy.current) {
        setPhase(result.progress.remaining === 0 ? "complete" : "checked");
        setConfirmed(false);
        setError(result.progress.remaining ? "Progress checked. Any existing queue record will be skipped. Review and confirm before queueing only the remaining addresses." : "");
      }
    } catch {
      if (mounted.current) setReadError("Progress could not be refreshed. The counts below are the last confirmed values, not proof that sending has stopped.");
    } finally {
      clearTimeout(timer); reading.current = false;
      if (mounted.current) setChecking(false);
    }
  }, [sourceId, statusUrl, updateProgress]);

  useEffect(() => {
    mounted.current = true;
    void checkProgress();
    return () => { mounted.current = false; submission.current?.abort(); readController.current?.abort(); };
  }, [checkProgress]);
  useEffect(() => {
    if (phase !== "queueing" && phase !== "uncertain" && progress.queued === 0 && progress.processing === 0) return;
    const timer = setInterval(() => {
      if (Date.now() - startedAt.current < 30 * 60_000) void checkProgress();
      else setReadError("Automatic refresh has paused. Use Check progress for the latest counts.");
    }, 5_000);
    return () => clearInterval(timer);
  }, [phase, progress.queued, progress.processing, checkProgress]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || phase === "uncertain" || !confirmed || !compatible || reviewChanged || progress.remaining === 0) return;
    busy.current = true;
    setPhase("queueing"); setError(""); setReadError("");
    const controller = new AbortController();
    submission.current = controller;
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-SIXFL-Announcement": "1" },
        body: JSON.stringify({ templateId, sourceId, audienceKey, confirmed: true }),
      });
      const result = await response.json();
      if (!mounted.current) return;
      if (!response.ok || result.ok !== true || !isProgress(result.progress, sourceId)) {
        if (response.status === 409) setReviewChanged(true);
        throw new Error(typeof result.error === "string" ? result.error : "The queueing result could not be confirmed.");
      }
      updateProgress(result.progress);
      setPhase("complete"); setConfirmed(false);
      if (result.queueFailures || result.progress.remaining) {
        setError("Queueing finished with some addresses still needing a check. Use Check progress before queueing the remainder. Existing messages will not be resent.");
        setPhase("uncertain");
      }
    } catch (cause) {
      if (!mounted.current) return;
      setPhase("uncertain"); setConfirmed(false);
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The result could not be confirmed in time. Some or all emails may already be queued. Check progress before trying again.");
    } finally {
      clearTimeout(timer); busy.current = false;
    }
  }
  const pending = phase === "queueing";
  return <div className="mt-5 space-y-4" aria-busy={pending}>
    <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-400/20 bg-black/20 p-4 text-sm text-emerald-50">
      <p className="font-semibold">{pending ? "Queueing announcement… Please do not click again." : phase === "uncertain" ? "Queueing outcome needs checking" : progress.remaining === 0 ? "All addresses have a recorded outcome for this announcement" : "Announcement queue and delivery progress"}</p>
      <p className="mt-2">{progress.recorded} of {progress.total} addresses recorded · {progress.remaining} not yet recorded.</p>
      {pending && <p className="mt-2 text-white/65">Keep this tab open until queueing is confirmed. Email delivery runs separately; this page does not wait for every email to send.</p>}
      {phase === "complete" && progress.remaining === 0 && <p className="mt-2 text-white/65">Queueing is complete. You can leave this page; any queued emails continue through the normal background sender.</p>}
    </div>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {([
        ["Queued", progress.queued], ["Sending", progress.processing], ["Sent to provider", progress.sent],
        ["Failed — review", progress.failed], ["Skipped", progress.skipped], ["Cancelled", progress.cancelled],
      ] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3"><dt className="text-xs text-white/60">{label}</dt><dd className="mt-1 text-xl font-semibold text-white">{value}</dd></div>)}
    </dl>
    <p className="text-xs leading-5 text-white/55">Sent to provider means the email service accepted the message, not that it has been read or delivered to an inbox. Failed, skipped and cancelled records are not automatically retried by this button.</p>
    {error && <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-100">{error}</p>}
    {readError && <p role="alert" className="text-sm text-amber-100">{readError}</p>}
    {reviewChanged && <p role="alert" className="text-sm text-amber-100">The template or contact list has changed. Reload this page and review the latest version before queueing anything else.</p>}
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <button type="button" onClick={() => void checkProgress(true)} disabled={checking} className="rounded-xl border border-white/20 px-4 py-2 text-white disabled:opacity-50">{checking ? "Checking progress…" : "Check progress"}</button>
      <a href={queueUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-200 underline">View this announcement in Queue</a>
      <span className="text-xs text-white/45">Last checked {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" }).format(new Date(progress.checkedAt))} (UK)</span>
    </div>
    <form onSubmit={submit} className="space-y-4">
      <label className="flex max-w-3xl items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
        <input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending || phase === "uncertain" || reviewChanged || progress.remaining === 0} className="mt-1 h-4 w-4" />
        <span>I have reviewed this template and contact list. Queue this saved revision to the remaining unique email addresses only.</span>
      </label>
      <button type="submit" disabled={pending || !confirmed || !compatible || reviewChanged || phase === "uncertain" || progress.remaining === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">
        {pending && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />}
        {pending ? "Queueing announcement…" : progress.remaining === 0 ? "No new emails to queue" : `Queue announcement to ${progress.remaining} remaining email${progress.remaining === 1 ? "" : "s"}`}
      </button>
    </form>
  </div>;
}
