"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
type Resolution = "outstanding" | "adjustment";
type Preview = { token: string; originalPence: number; receivedPence: number; outstandingPence: number; adjustmentPence: number; resolution: Resolution; reason: string; expiresAt: number };
type SavedResult = { outstandingPence: number; adjustmentPence?: number; resolution?: Resolution };
const money = (p: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
const field = "mt-2 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white";
const button = "rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50";
export default function CorrectOriginalPlayerChargeForm({ feeId, teamId, assignedPence, receivedPence }: { feeId: string; teamId: string; assignedPence: number; receivedPence: number }) {
  const [amount, setAmount] = useState((assignedPence / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<Resolution>("outstanding");
  const [noWaiver, setNoWaiver] = useState(false);
  const [adjustmentConfirmed, setAdjustmentConfirmed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedResult | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const account = `/captain/team/${teamId}/player-payments/account/${feeId}`;
  async function submit(action: "preview" | "confirm") {
    setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/admin/player-fees/${encodeURIComponent(feeId)}/correct-charge`, { method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(action === "preview"
          ? { action, originalAmount: amount, reason, resolution, noWaiver, adjustmentConfirmed }
          : { action, token: preview?.token, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The correction was not saved.");
      if (action === "preview") setPreview(result.preview); else setSaved(result);
    } catch (e) {
      if (action === "confirm") setUncertain(true);
      setError(e instanceof Error ? e.message : "Request failed. Check the account before trying again.");
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  if (saved) return <section role="status" className="space-y-4 rounded-2xl border border-emerald-400/30 p-5">
    <h2 className="text-xl font-semibold">Correction saved</h2>
    {saved.resolution === "adjustment" ? <>
      <p>The existing payment has been preserved and <strong>{money(saved.adjustmentPence ?? 0)}</strong> is recorded as a SIXFL adjustment. The player owes <strong>{money(saved.outstandingPence)}</strong>.</p>
      <p>No payment, refund, email or SMS has been requested. Team payments should now show the full assigned share as the verified receipt plus the adjustment.</p>
    </> : <>
      <p>The existing receipts have been preserved. Only the unpaid remainder is owed.</p>
      <p>Collection remains paused. No payment has been taken and no email or SMS has been requested. Review the account, then use its separate resume control when ready.</p>
    </>}
    <Link className="text-emerald-200 underline" href={account}>Open player account</Link></section>;
  return <section className="space-y-4">
    {error ? <p role="alert" className="rounded-xl border border-red-300/40 p-4 text-red-100">{error}{uncertain ? <> <Link href={account} className="underline">Check the player account before retrying.</Link> A retry of the same confirmation will not add the correction twice.</> : null}</p> : null}
    {!preview ? <form className="space-y-5" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit("preview"); }}>
      <p>Existing recorded Stripe payment: <strong>{money(receivedPence)}</strong>. This is not entered again.</p>
      <label className="block">Correct original assigned share (£)<input className={field} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required disabled={busy}/></label>
      <fieldset className="space-y-3 rounded-2xl border border-white/10 p-4">
        <legend className="px-1 font-semibold">What should happen to the difference?</legend>
        <label className="flex gap-3"><input type="radio" name="resolution" value="outstanding" checked={resolution === "outstanding"} onChange={() => setResolution("outstanding")} disabled={busy}/><span><strong>Player still owes it</strong><span className="mt-1 block text-sm text-white/65">Restore the unpaid remainder and pause collection until you review it.</span></span></label>
        <label className="flex gap-3"><input type="radio" name="resolution" value="adjustment" checked={resolution === "adjustment"} onChange={() => setResolution("adjustment")} disabled={busy}/><span><strong>Record it as a SIXFL adjustment</strong><span className="mt-1 block text-sm text-white/65">Keep the verified payment, settle the difference as an authorised adjustment and leave the player owing £0.</span></span></label>
      </fieldset>
      <label className="block">Reason for correction<textarea className={field} value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={1000} required disabled={busy} placeholder={resolution === "adjustment" ? "Assigned share was £8. Player correctly paid £5 and SIXFL agreed the remaining £3 adjustment." : "Original charge was £12. The £8 payment incorrectly cleared the full charge. No £4 waiver was agreed."}/></label>
      {resolution === "outstanding" ? <label className="flex gap-3"><input type="checkbox" checked={noWaiver} onChange={e => setNoWaiver(e.target.checked)} required disabled={busy}/><span>I have checked the agreement. The remaining amount was not waived, discounted or paid elsewhere.</span></label> :
        <label className="flex gap-3"><input type="checkbox" checked={adjustmentConfirmed} onChange={e => setAdjustmentConfirmed(e.target.checked)} required disabled={busy}/><span>I have checked this was a genuine SIXFL adjustment. The player should owe nothing further for this share.</span></label>}
      <button className={button} disabled={busy}>{busy ? "Verifying receipts…" : "Preview correction"}</button>
    </form> : <div className="space-y-5 rounded-2xl border border-amber-400/30 p-5">
      <h2 className="text-xl font-semibold">Review before saving</h2><dl className="space-y-3"><div className="flex justify-between gap-4"><dt>Correct original assigned share</dt><dd className="shrink-0 whitespace-nowrap">{money(preview.originalPence)}</dd></div>
        <div className="flex justify-between gap-4"><dt>Verified Stripe payment — retained once</dt><dd className="shrink-0 whitespace-nowrap">{money(preview.receivedPence)}</dd></div>
        {preview.resolution === "adjustment" ? <div className="flex justify-between gap-4"><dt>SIXFL adjustment</dt><dd className="shrink-0 whitespace-nowrap">{money(preview.adjustmentPence)}</dd></div> : null}
        <div className="flex justify-between gap-4 border-t border-white/15 pt-3 font-semibold"><dt>{preview.resolution === "adjustment" ? "Player still owes · Settled" : "Player still owes · Part-paid"}</dt><dd className="shrink-0 whitespace-nowrap">{money(preview.outstandingPence)}</dd></div></dl>
      <p className="break-words text-sm text-white/70">Reason: {preview.reason}</p><p className="text-sm text-white/70">Your administrator identity and this correction will be recorded. No new payment, refund or customer message will be sent.</p>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void submit("confirm")}>{busy ? "Saving correction…" : uncertain ? "Retry same confirmation" : "Confirm correction — no message"}</button>
        <button className="rounded-xl border border-white/20 px-5 py-3 disabled:opacity-50" disabled={busy || uncertain} onClick={() => setPreview(null)}>Back — do not save</button></div>
    </div>}
  </section>;
}
