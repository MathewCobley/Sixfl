"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function TeamLeadDecisionControls({ leadId, leadName, declined = false, declinedAt = null, converted = false }: {
  leadId: string; leadName: string; declined?: boolean; declinedAt?: string | null; converted?: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [via, setVia] = useState("SMS");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ declinedAt: string; cancelledCount: number; processingCount: number } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/decision`, {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-SIXFL-Lead-Decision": "1" },
        body: JSON.stringify({ decision: "DECLINED", via, note }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.declinedAt !== "string") throw new Error(result.error || "The decision could not be confirmed.");
      setSaved(result); setOpen(false); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "The save could not be confirmed. Refresh the lead to check before retrying.");
    } finally { clearTimeout(timer); busy.current = false; setPending(false); }
  }
  if (converted) return null;
  if (declined || saved) {
    const at = saved?.declinedAt || declinedAt;
    return <div className="max-w-sm rounded-xl border border-rose-400/20 bg-rose-500/10 p-3 text-left" role="status">
      <div className="text-sm font-bold text-rose-100">Not interested — chases stopped</div>
      {at ? <div className="mt-1 text-xs text-white/60">Recorded {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" }).format(new Date(at))} (UK)</div> : null}
      {saved ? <div className="mt-2 text-xs text-white/70">{saved.cancelledCount} unsent follow-up{saved.cancelledCount === 1 ? "" : "s"} cancelled. No message was sent by this action.</div> : null}
      {saved?.processingCount ? <p className="mt-2 text-xs text-amber-100">{saved.processingCount} follow-up{saved.processingCount === 1 ? " was" : "s were"} already being processed. Delivery will recheck the decision; anything already submitted cannot be recalled.</p> : null}
    </div>;
  }
  return <div className="max-w-sm text-left">
    {!open ? <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100 hover:bg-rose-500/20">Not interested — stop chasing</button> : (
      <form onSubmit={submit} className="min-w-[230px] space-y-3 rounded-xl border border-rose-400/25 bg-black/40 p-3">
        <p className="text-sm font-semibold text-white">Record a no from {leadName}?</p>
        <p className="text-xs leading-5 text-white/65">Closes this enquiry and stops its registration follow-ups. Keeps notes and messages. Does not send a reply or change other accounts or marketing permissions.</p>
        <label htmlFor={`${fieldId}-via`} className="block text-xs text-white/80">How did they tell you?</label>
        <select id={`${fieldId}-via`} value={via} onChange={event => setVia(event.target.value)} disabled={pending} className="w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-sm text-white">
          <option value="SMS">SMS</option><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="IN_PERSON">In person</option><option value="OTHER">Other</option>
        </select>
        <label htmlFor={`${fieldId}-note`} className="block text-xs text-white/80">Reason / note (optional)</label>
        <textarea id={`${fieldId}-note`} value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={3} disabled={pending} className="w-full rounded-lg border border-white/20 bg-black p-2 text-sm text-white" />
        {error ? <p role="alert" className="text-xs text-amber-100">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Confirm — stop chasing"}</button>
          <button type="button" disabled={pending} onClick={() => { setOpen(false); setError(""); }} className="rounded-lg px-3 py-2 text-xs text-white/70">Cancel</button>
        </div>
      </form>
    )}
  </div>;
}
