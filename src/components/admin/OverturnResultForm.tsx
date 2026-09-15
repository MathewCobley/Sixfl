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
  const [originalHomeScore, setOriginalHomeScore] = useState(p.homeScore);
  const [originalAwayScore, setOriginalAwayScore] = useState(p.awayScore);
  const field = "mt-2 block w-full rounded-xl border border-white/20 bg-black/30 p-3 text-white";
  return <details className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.06] p-5">
    <summary className="cursor-pointer text-lg font-semibold text-amber-100">Overturn result — competition decision</summary>
    <p className="mt-3 text-sm leading-6 text-white/75">Use this when the official result is being changed because of a competition decision. The original played score is retained permanently and shown alongside the awarded 3–0 result.</p>
    <form action={p.action} className="mt-5 space-y-5">
      <input type="hidden" name="fixtureId" value={p.fixtureId}/><input type="hidden" name="requestId" value={p.requestId}/>
      <input type="hidden" name="expectedResultUpdatedAt" value={p.updatedAt}/>
      <input type="hidden" name="expectedHomeScore" value={p.homeScore}/><input type="hidden" name="expectedAwayScore" value={p.awayScore}/>
      <fieldset className="rounded-xl border border-white/10 p-4">
        <legend className="px-1 text-sm font-semibold">Original on-pitch result</legend>
        <p className="mb-3 text-xs leading-5 text-white/55">Normally these match the score currently stored. If a legacy 3–0 amendment has already overwritten the played score, enter the actual on-pitch score here before recording the decision.</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <label className="text-sm">{p.homeTeam.name}<input name="originalHomeScore" type="number" min={0} value={originalHomeScore} onChange={e => { setOriginalHomeScore(Number(e.target.value)); setConfirmed(false); }} className={field} required/></label>
          <span className="pb-3 text-white/40">–</span>
          <label className="text-sm">{p.awayTeam.name}<input name="originalAwayScore" type="number" min={0} value={originalAwayScore} onChange={e => { setOriginalAwayScore(Number(e.target.value)); setConfirmed(false); }} className={field} required/></label>
        </div>
      </fieldset>
      <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Award a 3–0 win to</legend>
        {[p.homeTeam, p.awayTeam].map(t => <label key={t.id} className="flex items-start gap-3 rounded-xl border border-white/15 p-3"><input className="mt-1 h-4 w-4 shrink-0" type="radio" name="winnerTeamId" value={t.id} checked={winner === t.id} onChange={() => { setWinner(t.id); setConfirmed(false); }} required/><span>{t.name}</span></label>)}
      </fieldset>
      <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Reason</legend>
        {RESULT_OVERTURN_REASONS.map(r => <label key={r.value} className="flex gap-3 text-sm"><input className="mt-1 h-4 w-4 shrink-0" type="radio" name="reasonCode" value={r.value} required/><span>{r.label}</span></label>)}
      </fieldset>
      <label className="block text-sm">Applicable rules and decision basis<input name="rulesBasis" className={field} minLength={5} maxLength={500} required placeholder="Rule version in force on the match date, and relevant sections"/></label>
      <label className="block text-sm">Evidence and review notes — admin only<textarea name="evidenceNote" className={field} rows={4} minLength={10} maxLength={4000} required placeholder="Record what establishes the breach, approval checks and the team's opportunity to respond."/></label>
      {winner ? <div role="status" className="space-y-1 rounded-xl border border-amber-300/25 p-4"><p><span className="font-semibold">Original:</span> {p.homeTeam.name} {originalHomeScore}–{originalAwayScore} {p.awayTeam.name}</p><p className="font-semibold">Official awarded result: {p.homeTeam.name} {winner === p.homeTeam.id ? "3–0" : "0–3"} {p.awayTeam.name}</p></div> : null}
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" name="confirmed" value="yes" className="mt-1 h-4 w-4 shrink-0" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required/><span>I have verified the original on-pitch score above, reviewed the evidence and any approved exception, and given the team an opportunity to respond. I confirm the awarded winner above. The original score and decision will be retained.</span></label>
      <p className="text-sm text-white/65">No payment, refund, fine, email or SMS is triggered. Scorer records and existing disputes are not automatically changed. Notify both captains separately after saving.</p>
      <SaveButton/>
    </form>
  </details>;
}
