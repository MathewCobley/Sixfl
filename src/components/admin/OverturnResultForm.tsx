"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { RESULT_OVERTURN_REASONS } from "@/lib/fixtures/result-score";

type Props = {
  fixtureId: string; requestId: string; updatedAt: string; homeScore: number; awayScore: number;
  homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
  action: (form: FormData) => Promise<void>;
};
function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-black disabled:opacity-50">{pending ? "Recording decision…" : "Record overturned result"}</button>;
}
export default function OverturnResultForm(p: Props) {
  const [winner, setWinner] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const field = "mt-2 block w-full rounded-xl border border-white/20 bg-black/30 p-3 text-white";
  return <details className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.06] p-5">
    <summary className="cursor-pointer text-lg font-semibold text-amber-100">Overturn result — competition decision</summary>
    <p className="mt-3 text-sm leading-6 text-white/75">Not a score-entry correction. Keep the played score in an immutable decision record and award a 3–0 win for the league table. The predictor will continue to use the original on-pitch score.</p>
    <form action={p.action} className="mt-5 space-y-5">
      <input type="hidden" name="fixtureId" value={p.fixtureId}/><input type="hidden" name="requestId" value={p.requestId}/>
      <input type="hidden" name="expectedResultUpdatedAt" value={p.updatedAt}/>
      <input type="hidden" name="expectedHomeScore" value={p.homeScore}/><input type="hidden" name="expectedAwayScore" value={p.awayScore}/>
      <p className="rounded-xl border border-white/10 p-4 text-sm">Original on-pitch result: <strong>{p.homeTeam.name} {p.homeScore}–{p.awayScore} {p.awayTeam.name}</strong></p>
      <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Award a 3–0 win to</legend>
        {[p.homeTeam, p.awayTeam].map(t => <label key={t.id} className="flex items-start gap-3 rounded-xl border border-white/15 p-3"><input className="mt-1" type="radio" name="winnerTeamId" value={t.id} checked={winner === t.id} onChange={() => { setWinner(t.id); setConfirmed(false); }} required/><span>{t.name}</span></label>)}
      </fieldset>
      <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Reason</legend>
        {RESULT_OVERTURN_REASONS.map(r => <label key={r.value} className="flex gap-3 text-sm"><input type="radio" name="reasonCode" value={r.value} required/><span>{r.label}</span></label>)}
      </fieldset>
      <label className="block text-sm">Applicable rules and decision basis<input name="rulesBasis" className={field} minLength={5} maxLength={500} required placeholder="Rule version in force on the match date, and relevant sections"/></label>
      <label className="block text-sm">Evidence and review notes — admin only<textarea name="evidenceNote" className={field} rows={4} minLength={10} maxLength={4000} required placeholder="Record what establishes the breach, approval checks and the team's opportunity to respond."/></label>
      {winner ? <p role="status" className="rounded-xl border border-amber-300/25 p-4 font-semibold">Official awarded result: {p.homeTeam.name} {winner === p.homeTeam.id ? "3–0" : "0–3"} {p.awayTeam.name}</p> : null}
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="confirmed" value="yes" className="mt-1" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required/><span>I have verified this is the original score of a completed played match, reviewed the evidence and any approved exception, and given the team an opportunity to respond. I confirm the awarded winner above. The original score and decision will be retained.</span></label>
      <p className="text-sm text-white/65">No payment, refund, fine, email or SMS is triggered. Scorer records and existing disputes are not automatically changed. Notify both captains separately after saving.</p>
      <SaveButton/>
    </form>
  </details>;
}
