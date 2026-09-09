"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
type Preview = { token: string; originalPence: number; receivedPence: number; outstandingPence: number; reason: string; expiresAt: number };
const money = (p: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
const field = "mt-2 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white";
const button = "rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50";
export default function CorrectOriginalPlayerChargeForm({ feeId, teamId, assignedPence, receivedPence }: { feeId: string; teamId: string; assignedPence: number; receivedPence: number }) {
  const [amount, setAmount] = useState((assignedPence / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [noWaiver, setNoWaiver] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const account = `/captain/team/${teamId}/player-payments/account/${feeId}`;
  async function submit(action: "preview" | "confirm") {
    setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/admin/player-fees/${encodeURIComponent(feeId)}/correct-charge`, { method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(action === "preview" ? { action, originalAmount: amount, reason, noWaiver } : { action, token: preview?.token, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The correction was not saved.");
      if (action === "preview") setPreview(result.preview); else setSaved(true);
    } catch (e) {
      if (action === "confirm") setUncertain(true);
      setError(e instanceof Error ? e.message : "Request failed. Check the account before trying again.");
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  if (saved) return <section role="status" className="space-y-4 rounded-2xl border border-emerald-400/30 p-5">
    <h2 className="text-xl font-semibold">Correction saved</h2><p>The existing receipts have been preserved. Only the unpaid remainder is owed.</p>
    <p>Collection remains paused. No payment has been taken and no email or SMS has been requested. Review the account, then use its separate resume control when ready.</p>
    <Link className="text-emerald-200 underline" href={account}>Open player account</Link></section>;
  return <section className="space-y-4">
    {error ? <p role="alert" className="rounded-xl border border-red-300/40 p-4 text-red-100">{error}{uncertain ? <> <Link href={account} className="underline">Check the player account before retrying.</Link> A retry of the same confirmation will not add the correction twice.</> : null}</p> : null}
    {!preview ? <form className="space-y-5" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit("preview"); }}>
      <p>Existing recorded Stripe payment: <strong>{money(receivedPence)}</strong>. This is not entered again.</p>
      <label className="block">Correct original charge (£)<input className={field} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required disabled={busy}/></label>
      <label className="block">Reason for correction<textarea className={field} value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={1000} required disabled={busy} placeholder="Original charge was £12. The £8 payment incorrectly cleared the full charge. No £4 waiver was agreed."/></label>
      <label className="flex gap-3"><input type="checkbox" checked={noWaiver} onChange={e => setNoWaiver(e.target.checked)} required disabled={busy}/><span>I have checked the agreement. The remaining amount was not waived, discounted or paid elsewhere.</span></label>
      <button className={button} disabled={busy}>{busy ? "Verifying receipts…" : "Preview correction"}</button>
    </form> : <div className="space-y-5 rounded-2xl border border-amber-400/30 p-5">
      <h2 className="text-xl font-semibold">Review before saving</h2><dl className="space-y-3"><div className="flex justify-between gap-4"><dt>Correct original charge</dt><dd>{money(preview.originalPence)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Verified Stripe payments — retained once</dt><dd>{money(preview.receivedPence)}</dd></div>
        <div className="flex justify-between gap-4 border-t border-white/15 pt-3 font-semibold"><dt>Still owing · Part-paid</dt><dd>{money(preview.outstandingPence)}</dd></div></dl>
      <p className="break-words text-sm text-white/70">Reason: {preview.reason}</p><p className="text-sm text-white/70">Your administrator identity and this correction will be recorded in the statement. Collection stays paused. No payment, refund or message will be sent.</p>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void submit("confirm")}>{busy ? "Saving correction…" : uncertain ? "Retry same confirmation" : "Confirm correction — no message"}</button>
        <button className="rounded-xl border border-white/20 px-5 py-3 disabled:opacity-50" disabled={busy || uncertain} onClick={() => setPreview(null)}>Back — do not save</button></div>
    </div>}
  </section>;
}
