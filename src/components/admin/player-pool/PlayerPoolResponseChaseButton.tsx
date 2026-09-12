"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Target = { profileId: string; publicCode: string; reason: string | null };
export default function PlayerPoolResponseChaseButton() {
  const router = useRouter();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(send: boolean) {
    const eligible = targets?.filter(t => !t.reason) || [];
    if (send && (!eligible.length || !window.confirm(`Send a yes/no response request to these ${eligible.length} awaiting players? Existing replies, opt-outs, recent contact and queued messages are checked again. No records are closed unless the player explicitly says no.`))) return;
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/admin/player-pool/response-chases", send ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileIds: eligible.map(t => t.profileId), confirm: true }),
      } : { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The response chase could not be completed.");
      if (send) {
        setMessage(`${data.queued} response emails queued; ${data.skipped} skipped; ${data.failed} failed. Queued does not mean sent. Check the contact history on each card.`);
        setTargets(null); router.refresh();
      } else setTargets(data.targets);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to check PlayerPool."); }
    finally { setBusy(false); }
  }
  return <section className="border-b border-white/10 bg-emerald-500/5 p-4 sm:p-6">
    <h3 className="text-lg font-bold text-white">Still looking? Ask awaiting players for a yes or no</h3>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">A short follow-up explains that we cannot introduce a player to a team without a response and a completed profile. They can complete their profile or explicitly choose “No longer looking”. Silence does not close their enquiry. This response request is sent once per profile.</p>
    <div className="mt-3 flex flex-wrap gap-3">
      <button type="button" disabled={busy} onClick={() => act(false)} className="rounded-xl border border-emerald-400/30 px-4 py-3 font-bold text-emerald-100 disabled:opacity-40">{busy ? "Working…" : "Check awaiting players"}</button>
      {targets ? <button type="button" disabled={busy || !targets.some(t => !t.reason)} onClick={() => act(true)} className="rounded-xl bg-emerald-400 px-4 py-3 font-bold text-black disabled:opacity-40">Send {targets.filter(t => !t.reason).length} response requests</button> : null}
    </div>
    {targets ? <details className="mt-3 text-sm text-white/65"><summary className="cursor-pointer">{targets.filter(t => !t.reason).length} eligible; {targets.filter(t => t.reason).length} skipped — show review</summary><ul className="mt-2 space-y-1">{targets.map(t => <li key={t.profileId}>{t.publicCode}: {t.reason || "Eligible for one response request"}</li>)}</ul></details> : null}
    {message ? <p role="status" className="mt-3 text-sm text-white/80">{message}</p> : null}
  </section>;
}
