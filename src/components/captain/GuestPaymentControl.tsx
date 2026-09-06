"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type State = {
  canManage: boolean; editable: boolean; hasEmail: boolean; conflict: boolean;
  revision: number; kickoffAt: string; approvalStatus: string;
  fee: { id: string; amountPence: number; status: string; paymentUrl: string | null } | null;
  delivery: { status: string; sentAt: string | null; createdAt: string } | null;
};
const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const buttonStyle = "rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50";
async function responseJson(response: Response) {
  if (response.redirected) throw new Error("Sign in again and reload this fixture.");
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error(body?.error || "Guest payment details could not be loaded. Reload before retrying.");
  return body;
}

export default function GuestPaymentControl({ teamId, fixtureId, approvalId, revision, approvalStatus, playerName }: {
  teamId: string; fixtureId: string; approvalId: string; revision: number; approvalStatus: string; playerName: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = `/api/captain/team/${encodeURIComponent(teamId)}/guest-payments`;
  const url = `${endpoint}?fixtureId=${encodeURIComponent(fixtureId)}&approvalId=${encodeURIComponent(approvalId)}`;
  const reload = useCallback(async () => {
    const result = await responseJson(await fetch(url, { cache: "no-store" }));
    setState(result as State);
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setState(null);
    fetch(url, { cache: "no-store", signal: controller.signal }).then(responseJson)
      .then((value: State) => { if (!controller.signal.aborted) setState(value); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [url, revision, approvalStatus]);

  async function submit(event: FormEvent, action: "create" | "send") {
    event.preventDefault();
    if (busy || !state?.canManage || !state.editable) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await responseJson(await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, approvalId, action, amount, feeId: state.fee?.id ?? null,
          expectedRevision: state.revision, expectedKickoffAt: state.kickoffAt }),
      }));
      const status = result.paymentRequest?.status;
      setMessage(status === "queued" ? "Guest fee saved. Payment-link email queued."
        : status === "already_sent" ? "This payment-link email is already queued or sent. No duplicate fee or email was created."
        : status === "processing" ? "This payment request is already being prepared. Reload to check its status."
        : status === "paid" ? "This guest fee is already paid. No new payment was requested."
        : status === "no_fee" ? "No player payment is due. No payment email was sent."
        : "The guest fee is saved, but the payment email was not queued. Check the player's email, then retry Send payment link. Do not create another fee.");
      await reload(); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The change could not be confirmed. Reload before retrying.");
      // A lost response may follow a successful commit; recover the existing row first.
      await reload().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function copyLink() {
    if (!state?.fee?.paymentUrl) return;
    try { await navigator.clipboard.writeText(state.fee.paymentUrl); setMessage("Payment link copied."); }
    catch { setError("The browser could not copy the link. Open the payment link and copy its address."); }
  }

  const canAct = Boolean(state?.canManage && state.editable && !state.conflict && approvalStatus === "APPROVED");
  const queuedOrSent = ["QUEUED", "PROCESSING", "SENT"].includes(state?.delivery?.status ?? "");
  return <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
    <p className="text-sm font-semibold text-white">Guest payment</p>
    {loading ? <p role="status" className="text-xs text-white/60">Loading payment details…</p> : null}
    {error ? <p role="alert" className="text-sm text-red-100">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-emerald-100">{message}</p> : null}
    {state?.conflict ? <p className="text-sm text-amber-100">An existing squad/prospect fee or duplicate fee needs SIXFL review. No additional charge can be created here.</p> : null}
    {state?.fee ? <>
      <p className="text-sm text-white/80">{money(state.fee.amountPence)} · {state.fee.status === "PAID" ? "Paid" : state.fee.status === "WAIVED" ? "No payment needed" : state.fee.status === "CANCELLED" ? "Cancelled" : "Awaiting payment"}</p>
      {state.delivery ? <p className="text-xs text-white/60">Payment email: {state.delivery.status.toLowerCase().replaceAll("_", " ")}</p> : null}
      {canAct && state.fee.status === "OPEN" ? <div className="flex flex-wrap gap-2">
        <form onSubmit={(event) => void submit(event, "send")}>
          <button disabled={busy || queuedOrSent || !state.hasEmail} className={buttonStyle}>{busy ? "Sending…" : queuedOrSent ? "Email queued / sent" : "Send payment link"}</button>
        </form>
        {state.fee.paymentUrl ? <><button type="button" className={buttonStyle} onClick={() => void copyLink()}>Copy payment link</button><a className={buttonStyle} href={state.fee.paymentUrl} target="_blank" rel="noopener noreferrer">Open payment link</a></> : null}
      </div> : null}
      <p className="text-xs text-white/55">The existing fee is reused, not charged again. Amount changes, cash payments and cancellations stay in the existing SIXFL payment controls.</p>
    </> : !loading && state ? <>
      <p className="text-sm text-white/65">No fee set for this guest.</p>
      {canAct ? <form onSubmit={(event) => void submit(event, "create")} className="space-y-3">
        <label className="block text-sm text-white/80">Match fee for {playerName} (£)
          <input className="mt-2 block w-full max-w-48 rounded-xl border border-white/20 bg-black/30 px-3 py-2.5 text-white" aria-label={`Guest match fee for ${playerName}`} value={amount} onChange={(event) => setAmount(event.target.value)} type="number" inputMode="decimal" min="0" max="100" step="0.01" required disabled={busy} placeholder="Enter amount" />
        </label>
        <p className="text-xs leading-5 text-white/60">By creating the fee you confirm the player has agreed to play for this team and to this amount. Enter 0 only when no player fee is due. No second request or pass code is needed.</p>
        <button className={buttonStyle} disabled={busy || !amount.trim() || (!state.hasEmail && Number(amount) !== 0)}>{busy ? "Saving…" : amount.trim() && Number(amount) === 0 ? "Save £0 — no payment needed" : "Create fee and send payment link"}</button>
      </form> : null}
    </> : null}
    {state && !state.hasEmail ? <p className="text-sm text-amber-100">A real email address must be saved on this player's existing account before a payment link can be requested.</p> : null}
    {state && !state.editable ? <p className="text-xs text-white/60">No new guest payment can be requested here while approval is revoked or the fixture is outside its payment window. Existing fees are not automatically cancelled.</p> : null}
    <button type="button" disabled={busy || loading} onClick={() => { setError(""); void reload().catch((err: Error) => setError(err.message)); }} className="text-xs text-white/60 underline">Refresh payment status</button>
  </div>;
}
