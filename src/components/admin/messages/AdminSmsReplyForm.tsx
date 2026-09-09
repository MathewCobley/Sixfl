"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SmsReplyReceipt } from "@/lib/messaging/admin-sms-reply";
import { smsReplyStatusLabel } from "@/lib/messaging/sms-reply-display";

const ENDPOINT = "/api/admin/messages/sms-reply";
type Draft = { body: string; requestId: string; expectedPhone: string; attempted: boolean; updatedAt: number };
type Props = { threadId: string; actorId: string; phone: string | null; canReply: boolean };
function newDraft(phone: string | null): Draft {
  return { body: "", requestId: crypto.randomUUID(), expectedPhone: phone || "", attempted: false, updatedAt: Date.now() };
}
function queueTime(value: string | null) {
  if (!value) return "the next queue run";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) + " (UK)";
}
export default function AdminSmsReplyForm({ threadId, actorId, phone, canReply }: Props) {
  const router = useRouter();
  const storageKey = `sixfl:sms-reply:v1:${actorId}:${threadId}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState("");
  const [record, setRecord] = useState<SmsReplyReceipt | null>(null);
  const [recordRequestId, setRecordRequestId] = useState("");
  const inFlight = useRef(false);
  const alive = useRef(true);
  const draftRef = useRef<Draft | null>(null);

  function save(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Controlled draft is still retained for this page. */ }
  }
  useEffect(() => {
    alive.current = true;
    let initial = newDraft(phone);
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") as Draft | null;
      if (saved && typeof saved.body === "string" && typeof saved.requestId === "string" && typeof saved.expectedPhone === "string" && typeof saved.attempted === "boolean" && Date.now() - saved.updatedAt < 24 * 60 * 60 * 1000) initial = saved;
    } catch { /* Unavailable/corrupt browser storage must not prevent replying. */ }
    draftRef.current = initial;
    setDraft(initial);
    setUncertain(initial.attempted);
    if (initial.attempted) setNotice("A previous send attempt needs checking. Your text is kept; check status before retrying.");
    return () => { alive.current = false; };
    // This component is keyed by actor and thread at its owner. Never import
    // another person's or conversation's stored draft when selecting a thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function accept(saved: SmsReplyReceipt, requestId: string) {
    setRecord(saved);
    setRecordRequestId(requestId);
    setUncertain(false);
    if (["QUEUED", "PROCESSING", "SENT"].includes(saved.status)) {
      if (draftRef.current?.requestId === requestId) save(newDraft(phone));
      setNotice(saved.status === "QUEUED" ? "Reply saved and queued. You can leave this page; it has not been sent yet." : "The saved reply was found. No second copy was queued.");
    } else {
      if (draftRef.current?.requestId === requestId) save({ ...draftRef.current, attempted: true });
      setNotice(saved.failureReason || "The reply was recorded but is not queued for sending. Check the status below and the notification queue.");
    }
    router.refresh();
  }

  async function checkStatus() {
    const requestId = uncertain ? draftRef.current?.requestId : recordRequestId || draftRef.current?.requestId;
    if (!requestId || checking || inFlight.current) return;
    setChecking(true);
    try {
      const response = await fetch(`${ENDPOINT}?${new URLSearchParams({ threadId, requestId })}`, { cache: "no-store", credentials: "same-origin", redirect: "error", signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Status could not be checked. Your draft is kept.");
      if (!alive.current) return;
      if (data.record) accept(data.record as SmsReplyReceipt, requestId);
      else {
        setUncertain(false);
        setNotice("No saved reply was found for this attempt. You can retry the same reply safely; its reference is unchanged.");
      }
    } catch (error) {
      if (alive.current) setNotice(error instanceof Error ? error.message : "Status could not be checked. Your draft is kept.");
    } finally { if (alive.current) setChecking(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !draftRef.current || !canReply || !actorId || uncertain) return;
    const current = draftRef.current;
    if (!current.body.trim()) { setNotice("Type your SMS reply before sending."); return; }
    if (current.body.length > 1500) { setNotice("Please shorten the reply to 1,500 characters or fewer."); return; }
    const attempt = { ...current, expectedPhone: current.attempted ? current.expectedPhone : phone || "", attempted: true, updatedAt: Date.now() };
    save(attempt); // Persist BEFORE the request; a reload must retain its retry ID.
    inFlight.current = true;
    setBusy(true);
    setNotice("Saving your reply to the SMS queue…");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json", "x-sixfl-sms-reply": "1" },
        body: JSON.stringify({ threadId, requestId: attempt.requestId, body: attempt.body, expectedPhone: attempt.expectedPhone }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!alive.current) return;
      if (!response.ok || !data.ok || !data.record?.messageId) {
        setUncertain(data.uncertain !== false);
        setNotice(data.error || "The reply outcome needs checking. Your draft is kept.");
        if (data.uncertain === false) save({ ...attempt, attempted: false });
        return;
      }
      accept(data.record as SmsReplyReceipt, attempt.requestId);
    } catch {
      if (alive.current) { setUncertain(true); setNotice("The connection ended without a confirmed result. Your draft is kept. Check status before retrying; do not start a second copy."); }
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const savedBlocked = Boolean(record && !["QUEUED", "PROCESSING", "SENT"].includes(record.status));
  return (
    <form method="post" action={ENDPOINT} onSubmit={submit} className="mt-4 space-y-4" aria-busy={busy}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
        {canReply && phone ? `Replying by SMS to ${phone}. Your reply stays in this conversation.` : "SMS reply unavailable. Check the contact number and that the conversation is open."}
      </div>
      <label className="block text-sm font-semibold text-white/75" htmlFor={`sms-reply-${threadId}`}>SMS reply</label>
      <textarea id={`sms-reply-${threadId}`} name="body" rows={5} required maxLength={1500}
        value={draft?.body || ""} disabled={!draft || !canReply || !actorId}
        readOnly={busy || uncertain || Boolean(draft?.attempted)}
        onChange={event => { if (draft && !draft.attempted) save({ ...draft, body: event.target.value, updatedAt: Date.now() }); }}
        placeholder="Type your SMS reply here..."
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40 disabled:opacity-60" />
      {notice ? <div role="status" aria-live="polite" className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-50">{notice}</div> : null}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!draft || !canReply || !actorId || busy || checking || uncertain || savedBlocked}
          className="inline-flex min-h-11 items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Queueing reply…" : draft?.attempted ? "Retry this reply safely" : "Send SMS reply"}
        </button>
        {(draft?.attempted || record) ? <button type="button" onClick={checkStatus} disabled={checking || busy} className="min-h-11 rounded-xl border border-white/20 px-3 text-sm text-white disabled:opacity-50">{checking ? "Checking…" : "Check status"}</button> : null}
        {record && ["FAILED", "SKIPPED", "CANCELLED"].includes(record.status) ? <button type="button" disabled={busy || checking || uncertain} onClick={() => { save(newDraft(phone)); setRecord(null); setRecordRequestId(""); setUncertain(false); setNotice("New empty draft opened. The previous reply has not been retried."); }} className="min-h-11 rounded-xl border border-white/20 px-3 text-sm text-white disabled:opacity-50">Write another reply</button> : null}
      </div>
      {record ? <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm">
        <div className="font-semibold text-white">{smsReplyStatusLabel(record.status, record.providerStatus)}</div>
        {record.status === "QUEUED" ? <p className="text-white/65">Eligible to send from {queueTime(record.scheduledFor)}. Normal SMS quiet hours still apply.</p> : null}
        {record.failureReason ? <p className="text-amber-200">{record.failureReason}</p> : null}
        <p className="whitespace-pre-wrap break-words text-white/75">{record.body}</p>
        <a href={`/admin/queue?q=${encodeURIComponent(record.dispatchId || record.messageId)}`} className="inline-block text-emerald-200 underline">View this reply in Queue</a>
      </div> : null}
      <p className="text-xs text-white/45">A queued reply is saved, not yet delivered. Check status only reads its progress and never sends another copy.</p>
    </form>
  );
}
