"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { OVERTURN_REASONS, type ResultScores } from "@/lib/results/result-scores";
type Preview = { token: string; expiresAt: number; original: ResultScores; awarded: ResultScores };
const field = "mt-2 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-white";
const button = "rounded-xl bg-amber-300 px-5 py-3 font-semibold text-black disabled:opacity-50";
export default function OverturnResultForm({ fixtureId, home, away, original }: {
  fixtureId: string; home: { id: string; name: string }; away: { id: string; name: string }; original: ResultScores;
}) {
  const [winnerTeamId, setWinner] = useState("");
  const [reasonCode, setCategory] = useState("");
  const [decisionReason, setReason] = useState("");
  const [evidenceReference, setEvidence] = useState("");
  const [rulesBasis, setRules] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const decisionUrl = `/admin/fixtures/${fixtureId}/overturn`;
  const score = (s: ResultScores) => `${home.name} ${s.homeScore}–${s.awayScore} ${away.name}`;
  async function submit(action: "preview" | "confirm") {
    setBusy(true); setError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`/api/admin/fixtures/${encodeURIComponent(fixtureId)}/overturn`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify(action === "preview" ? { action, winnerTeamId, reasonCode, decisionReason, evidenceReference, rulesBasis }
          : { action, token: preview?.token, confirmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The decision was not saved.");
      if (action === "preview") { setPreview(result.preview); setConfirmed(false); } else setSaved(true);
    } catch (e) {
      if (action === "confirm") setUncertain(true);
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally { clearTimeout(timeout); setBusy(false); }
  }
  if (saved) return <section role="status" className="space-y-4 rounded-2xl border border-emerald-300/30 p-5">
    <h2 className="text-xl font-semibold">Overturned result recorded</h2>
    <p>The original score is preserved. The awarded result now counts in the league table; the AI Predictor uses the original on-pitch score.</p>
    <p>No payment, refund, email or SMS was requested. Notify both captains separately. Any existing dispute remains available for its own review.</p>
    <a className="text-emerald-200 underline" href={decisionUrl}>View saved decision</a>
  </section>;
  return <section className="space-y-5">
    {error ? <p role="alert" className="rounded-xl border border-red-300/30 p-4 text-red-100">{error}{uncertain ? <> <a className="underline" href={decisionUrl}>Check the saved decision before retrying.</a> Retrying the same confirmation cannot apply it twice.</> : null}</p> : null}
    {!preview ? <form className="space-y-5" onSubmit={(e: FormEvent) => { e.preventDefault(); void submit("preview"); }}>
      <div className="rounded-xl border border-white/15 p-4"><p className="text-sm text-white/60">Original on-pitch result · preserved</p><p className="mt-1 font-semibold">{score(original)}</p></div>
      <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 font-semibold">Award a 3–0 win to</legend>{[home, away].map(team => <label key={team.id} className="flex gap-3 rounded-xl border border-white/15 p-4"><input type="radio" name="winner" value={team.id} checked={winnerTeamId === team.id} onChange={() => setWinner(team.id)} required/><span>{team.name}</span></label>)}</fieldset>
      <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 font-semibold">Decision category</legend>{OVERTURN_REASONS.map(reason => <label key={reason.value} className="flex gap-3 rounded-xl border border-white/10 p-3"><input type="radio" name="reasonCode" value={reason.value} checked={reasonCode === reason.value} onChange={() => setCategory(reason.value)} required/><span>{reason.label}</span></label>)}</fieldset>
      <label className="block">Decision reason — admin only<textarea className={field} rows={4} value={decisionReason} onChange={e => setReason(e.target.value)} minLength={20} maxLength={4000} required disabled={busy}/></label>
      <label className="block">Evidence reference — admin only<textarea className={field} rows={2} value={evidenceReference} onChange={e => setEvidence(e.target.value)} minLength={5} maxLength={2000} required disabled={busy} placeholder="Reference to the reviewed footage, referee account or retained correspondence"/></label>
      <label className="block">Rules in force for this fixture — admin only<textarea className={field} rows={2} value={rulesBasis} onChange={e => setRules(e.target.value)} minLength={5} maxLength={1000} required disabled={busy} placeholder="Record the applicable rule version and sections; do not apply later changes retrospectively."/></label>
      <button className={button} disabled={busy}>{busy ? "Preparing preview…" : "Preview overturned result"}</button>
    </form> : <div className="space-y-5 rounded-2xl border border-amber-300/35 p-5">
      <h2 className="text-xl font-semibold">Check the decision before saving</h2>
      <div><p className="text-sm text-white/60">Original · retained for the AI Predictor</p><p className="font-semibold">{score(preview.original)}</p></div>
      <div><p className="text-sm text-white/60">Awarded · official result for the league table</p><p className="text-lg font-semibold text-amber-100">{score(preview.awarded)}</p></div>
      <p className="text-sm text-white/70">The public will see “Awarded · Result overturned by SIXFL” and the original score. Your reason, evidence reference and rules notes remain admin-only. Scorer records, fees, payments and published news are not rewritten. No email or SMS is sent.</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} className="mt-1"/><span>I have reviewed the evidence, given the team a reasonable opportunity to respond, and confirm this awarded result. This decision and the original score will be protected against ordinary edits.</span></label>
      <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || !confirmed} onClick={() => void submit("confirm")}>{busy ? "Saving decision…" : uncertain ? "Retry same confirmation" : "Confirm overturn — no messages"}</button><button className="rounded-xl border border-white/20 px-5 py-3 disabled:opacity-50" disabled={busy || uncertain} onClick={() => setPreview(null)}>Back — do not save</button></div>
    </div>}
    <Link className="text-emerald-200 underline" href={`/admin/fixtures/${fixtureId}/result`}>Back to result</Link>
  </section>;
}
