"use client";
import { useState } from "react";
import Link from "next/link";
import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import { previewPlayerWarningAction, sendPlayerWarningAction } from "@/app/(admin)/admin/payments/player-warning/actions";
import type { PlayerPaymentWarningPreview } from "@/lib/payments/player-payment-warning";

type Props = { feeId: string; email: string | null; phone: string | null; emailAllowed: boolean; smsAllowed: boolean; defaultDeadline: string };
export default function PlayerPaymentWarningForm(props: Props) {
  const [channel, setChannel] = useState(props.emailAllowed ? "EMAIL" : "SMS");
  const [deadlineLocal, setDeadline] = useState(props.defaultDeadline);
  const [preview, setPreview] = useState<PlayerPaymentWarningPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ status: string; channel: string; scheduledFor: string; duplicate: boolean } | null>(null);
  function resetPreview() { setPreview(null); setConfirmed(false); setError(null); }
  async function onPreview(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); resetPreview();
    try {
      const result = await previewPlayerWarningAction({ feeId: props.feeId, channel, deadlineLocal });
      if (result.ok) setPreview(result.preview); else setError(result.error);
    } catch { setError("Unable to load the preview. Nothing has been sent."); }
    finally { setBusy(false); }
  }
  async function onSend() {
    if (!preview || !confirmed || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await sendPlayerWarningAction(preview.previewToken);
      if (result.ok) { setReceipt(result.receipt); setPreview(null); }
      else { setError(result.error); setPreview(null); setConfirmed(false); }
    } catch {
      // Retain the exact signed request on network failure; a retry cannot make
      // another outbox entry if the first confirmation already reached the server.
      setError("The result could not be confirmed. Check the warning history or retry this same confirmation; it will not create a duplicate.");
    } finally { setBusy(false); }
  }
  if (receipt) return <section role="status" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-white">
    <h2 className="text-xl font-semibold">{receipt.duplicate ? "Warning already requested" : "Payment warning queued"}</h2>
    <p className="mt-2">{receipt.channel} · {receipt.status.toLowerCase()} · scheduled for {receipt.scheduledFor}.</p>
    <p className="mt-2 text-sm text-white/65">Queued does not mean delivered. The fee and recipient will be checked again before sending.</p>
    <div className="mt-4 flex flex-wrap gap-4"><Link href="/admin/queue" className="text-emerald-200 underline">View delivery queue</Link><Link href="/admin/payments?view=playerFees" className="text-emerald-200 underline">Return to player fees</Link></div>
  </section>;
  return <div className="space-y-5">
    <form onSubmit={onPreview} className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <fieldset disabled={busy} className="space-y-3"><legend className="mb-3 font-semibold text-white">Send one warning by</legend>
        {([['EMAIL', 'Email', props.email, props.emailAllowed], ['SMS', 'SMS', props.phone, props.smsAllowed]] as const).map(([value, label, contact, allowed]) =>
          <label key={value} className={`flex items-center gap-3 rounded-xl border border-white/10 p-3 ${allowed ? "text-white" : "text-white/40"}`}>
            <input type="radio" name="warning-channel" value={value} checked={channel === value} disabled={!allowed} onChange={() => { setChannel(value); resetPreview(); }} />
            <span className="min-w-0 break-all">{label}: {contact || "No saved contact"}{!allowed ? " — unavailable or opted out" : ""}</span>
          </label>)}
      </fieldset>
      <label className="block space-y-2"><span className="font-semibold text-white">Payment deadline (UK time)</span>
        <input type="datetime-local" required value={deadlineLocal} disabled={busy} onChange={event => { setDeadline(event.target.value); resetPreview(); }} className="block w-full max-w-sm rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-white [color-scheme:dark]" />
      </label>
      <p className="text-sm text-white/60">Allow at least one hour and choose a deadline within 30 days. SMS is sent between 09:00 and 21:00 UK time. This warning does not add a fine, suspend the player or change the amount owed.</p>
      <button type="submit" disabled={busy || (!props.emailAllowed && !props.smsAllowed)} className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-black disabled:opacity-40">{busy ? "Working…" : "Preview payment warning"}</button>
    </form>
    {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</p> : null}
    {preview ? <section className="min-w-0 space-y-4 rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5">
      <h2 className="text-xl font-semibold text-white">Check this individual warning</h2>
      <p className="break-words text-white">To: <strong>{preview.playerName}</strong> · {preview.recipient}</p>
      <p className="text-sm text-white/75">{preview.fixtureLabel} · {preview.amount}<br />Deadline: {preview.deadline}<br />Scheduled: {preview.scheduledFor}</p>
      <p className="break-all text-sm text-white/70">Payment link: {preview.paymentUrl}</p>
      {preview.subject ? <p className="font-medium text-white">Subject: {preview.subject}</p> : null}
      {preview.bodyHtml ? <EmailHtmlPreview html={preview.bodyHtml} title="Player payment warning email preview" /> : <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/25 p-4 font-sans text-sm text-white">{preview.bodyText}</pre>}
      {preview.channel === "SMS" ? <p className="text-xs text-white/60">The payment URL will be shortened when queued; the destination remains the link shown above.</p> : null}
      <label className="flex items-start gap-3 text-sm text-white"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />I have checked the player, unpaid fee and deadline. Send this warning to this individual only.</label>
      <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !confirmed} onClick={onSend} className="rounded-xl bg-red-500 px-5 py-3 font-semibold text-white disabled:opacity-40">{busy ? "Queueing…" : "Confirm and send warning"}</button><button type="button" disabled={busy} onClick={resetPreview} className="rounded-xl border border-white/20 px-5 py-3 text-white">Cancel preview</button></div>
    </section> : null}
  </div>;
}
