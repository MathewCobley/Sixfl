import Link from "next/link";
import type { RecruitmentMatch } from "@/lib/players/player-data-health-matches";
import { REGISTRATION_PENDING_STATUSES } from "@/lib/managed-squad/registration-reminder-policy";
import { confirmIdentityAction } from "@/app/(admin)/admin/players/data-health/actions";
import HealthSubmitButton from "./HealthSubmitButton";

function isSameNameOnlyEvidence(evidence: string[]) {
  return evidence.length === 1 && evidence[0] === "Same name";
}

export default function PlayerDataHealthReview({ matches }: { matches: RecruitmentMatch[] }) {
  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
    <div className="border-b border-white/10 px-5 py-4"><h2 className="text-xl font-semibold text-white">Recruitment overlaps and possible duplicates</h2>
      <p className="mt-2 text-sm text-white/60">Green records are eligible for safe cleanup. Amber records require a person-by-person check. <strong className="text-amber-100">A matching name on its own is not evidence that two records are the same person.</strong> Multiple teams on one account are not duplicate accounts.</p></div>
    {!matches.length ? <p className="p-6 text-white/60">No matching records in this view.</p> : <div className="divide-y divide-white/10">{matches.map(match => {
      const r = match.record;
      const sameNameOnly = !match.safe && match.candidates.some(c => isSameNameOnlyEvidence(c.evidence));
      const canCloseOtherTeam = r.kind === "PROSPECT" && Boolean(r.teamId)
        && REGISTRATION_PENDING_STATUSES.includes(r.status)
        && match.candidates.some(c => !c.teams.some(t => t.id === r.teamId));
      return <article key={`${r.kind}:${r.id}`} id={`record-${r.id}`} className="space-y-4 p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0 break-words"><h3 className="text-lg font-bold text-white">{r.name || "Unnamed enquiry"}</h3>
            <p className="text-sm text-white/60">{r.publicCode ? `PlayerPool ${r.publicCode}` : r.kind === "LEAD" ? "Player lead" : "Prospect"} · {r.status.replaceAll('_',' ')}</p>
            <p className="mt-2 text-sm text-white/70">Recruitment email: {r.email || "Not saved"}</p><p className="text-sm text-white/70">Mobile: {r.phone || "Not saved"}</p>
            {r.teamName ? <p className="text-sm text-white/60">Enquiry assigned to {r.teamName}</p> : null}</div>
          <span className={`h-fit rounded-xl border px-3 py-2 text-sm font-bold ${match.safe ? 'border-emerald-400/30 text-emerald-200' : 'border-amber-400/30 text-amber-200'}`}>{match.safe ? "Safe to reconcile" : sameNameOnly ? "Investigate first" : "Review required"}</span>
        </div>
        <p className="text-sm text-white/65">{match.reason}</p>
        {sameNameOnly ? <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-4 text-sm leading-6 text-amber-50/85">
          <strong className="block text-amber-100">Possible existing player — same name only</strong>
          <span className="mt-1 block">Do not reconcile this record from the name match alone. Check the registered player, recruitment communications and any contact details first. Different emails, different teams or missing mobile evidence may mean these are two different people.</span>
        </div> : null}
        <div className="grid gap-3 md:grid-cols-2">{match.candidates.map(c => {
          const weakNameOnly = isSameNameOnlyEvidence(c.evidence);
          return <div key={c.userId} className={`min-w-0 break-words rounded-xl border p-4 ${weakNameOnly ? 'border-amber-400/30 bg-amber-500/[0.05]' : 'border-white/10 bg-black/20'}`}>
          <h4 className="font-semibold text-white">{c.name || "Unnamed account"}</h4><p className="mt-1 text-sm text-white/65">Registered email: {c.email || "No login email"}</p>
          <p className="text-sm text-white/65">Mobile: {c.phones.join(', ') || "Not saved"}</p>
          <p className="mt-2 text-sm text-emerald-200">Squad: {c.teams.map(t => t.name).join(', ')}</p>
          <p className="mt-2 text-xs leading-5 text-amber-100/85">Match evidence: {c.evidence.join(' · ')}</p>
          {weakNameOnly ? <p className="mt-2 text-xs font-semibold leading-5 text-amber-100">Same name only — not enough evidence to identify this as the same person.</p> : null}
          <Link href={`/admin/players/audit?q=${encodeURIComponent(c.email || c.name || c.userId)}`} className="mt-3 inline-block text-sm font-semibold text-emerald-200 underline">{weakNameOnly ? "Investigate registered player" : "Inspect registered player"}</Link>
        </div>})}</div>
        <div className="flex flex-wrap gap-4 text-sm text-emerald-200">
          {r.kind === 'PROSPECT' ? <Link className="underline" href={`/admin/player-prospects/${r.id}/communications`}>Recruitment communications</Link> : <Link className="underline" href={`/admin/leads/${r.id}`}>Open player lead</Link>}
          <Link className="underline" href={`/admin/players/audit?q=${encodeURIComponent(r.email || r.name)}`}>Full identity audit</Link>
        </div>
        {!match.safe ? <details className="rounded-xl border border-amber-400/20 p-4"><summary className="cursor-pointer text-sm font-bold text-amber-100">{sameNameOnly ? "Only after verification — reconcile this recruitment record" : "I have verified the person — reconcile this recruitment record"}</summary>
          <form action={confirmIdentityAction} className="mt-4 space-y-4 text-sm text-white/75">
            {sameNameOnly ? <p className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3 text-amber-50/85"><strong>Verification required:</strong> a same-name match by itself is not enough. Continue only after you have independently confirmed these records belong to the same person.</p> : null}
            <input type="hidden" name="kind" value={r.kind}/><input type="hidden" name="recordId" value={r.id}/><input type="hidden" name="fingerprint" value={match.fingerprint}/>
            <fieldset className="space-y-2"><legend className="mb-2 font-bold text-white">Choose the existing registered account — keep all its squads</legend>{match.candidates.map(c => <label key={c.userId} className="flex gap-3 rounded-xl border border-white/10 p-3"><input type="radio" required name="userId" value={c.userId}/><span className="break-words">{c.name || "Unnamed account"} · {c.email || "No email"}<span className="mt-1 block text-emerald-200">Keep registered with: {c.teams.map(t => t.name).join(', ')}</span></span></label>)}</fieldset>
            <p>This does not merge accounts, change emails, add or remove squad memberships, move a player between teams or alter payments. Communication history is retained. Existing declined/paused statuses stay unchanged.</p>
            {canCloseOtherTeam ? <label className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
              <input type="checkbox" name="closeOtherTeamEnquiryId" value={r.teamId!} className="mt-1 shrink-0" />
              <span><strong className="block text-amber-100">Close this other-team enquiry as a duplicate</strong>
                <span className="mt-1 block">Close only the obsolete {r.teamName || "assigned team"} prospect and any pending introduction for that same enquiry. Keep every squad listed on the selected account above. Do not register this player with {r.teamName || "the enquiry team"}.</span>
                <span className="mt-2 block text-xs text-white/60">Optional and unchecked by default. The old team assignment, contact details and messages stay in history, with an audit link to the chosen existing player. Leave unticked to keep this enquiry open.</span>
              </span>
            </label> : <p>Enquiries assigned to another team are kept open unless you explicitly choose to close that obsolete enquiry.</p>}
            <label className="block">How did you verify this is the same person, and what should happen to this enquiry?<textarea name="reason" minLength={10} maxLength={1000} required className="mt-2 block min-h-20 w-full rounded-xl border border-white/20 bg-black/25 p-3" /></label>
            <label className="block">Type <strong>CONFIRM</strong> to continue<input name="confirmation" required pattern="CONFIRM" autoComplete="off" className="mt-2 block w-full max-w-sm rounded-xl border border-white/20 bg-black/25 p-3" /></label>
            <HealthSubmitButton>Confirm existing player and reconcile</HealthSubmitButton>
          </form>
        </details> : null}
      </article>;
    })}</div>}
  </section>;
}
