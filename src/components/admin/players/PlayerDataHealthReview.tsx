import Link from "next/link";
import type { RecruitmentMatch } from "@/lib/players/player-data-health-matches";
import { confirmIdentityAction } from "@/app/(admin)/admin/players/data-health/actions";
import HealthSubmitButton from "./HealthSubmitButton";

export default function PlayerDataHealthReview({ matches }: { matches: RecruitmentMatch[] }) {
  return <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
    <div className="border-b border-white/10 px-5 py-4"><h2 className="text-xl font-semibold text-white">Recruitment overlaps and possible duplicates</h2>
      <p className="mt-2 text-sm text-white/60">Green records are eligible for safe cleanup. Amber records require a person-by-person check. Multiple teams on one account are not duplicate accounts.</p></div>
    {!matches.length ? <p className="p-6 text-white/60">No matching records in this view.</p> : <div className="divide-y divide-white/10">{matches.map(match => {
      const r = match.record;
      return <article key={`${r.kind}:${r.id}`} id={`record-${r.id}`} className="space-y-4 p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0 break-words"><h3 className="text-lg font-bold text-white">{r.name || "Unnamed enquiry"}</h3>
            <p className="text-sm text-white/60">{r.publicCode ? `PlayerPool ${r.publicCode}` : r.kind === "LEAD" ? "Player lead" : "Prospect"} · {r.status.replaceAll('_',' ')}</p>
            <p className="mt-2 text-sm text-white/70">Recruitment email: {r.email || "Not saved"}</p><p className="text-sm text-white/70">Mobile: {r.phone || "Not saved"}</p>
            {r.teamName ? <p className="text-sm text-white/60">Enquiry assigned to {r.teamName}</p> : null}</div>
          <span className={`h-fit rounded-xl border px-3 py-2 text-sm font-bold ${match.safe ? 'border-emerald-400/30 text-emerald-200' : 'border-amber-400/30 text-amber-200'}`}>{match.safe ? "Safe to reconcile" : "Review required"}</span>
        </div>
        <p className="text-sm text-white/65">{match.reason}</p>
        <div className="grid gap-3 md:grid-cols-2">{match.candidates.map(c => <div key={c.userId} className="min-w-0 break-words rounded-xl border border-white/10 bg-black/20 p-4">
          <h4 className="font-semibold text-white">{c.name || "Unnamed account"}</h4><p className="mt-1 text-sm text-white/65">Registered email: {c.email || "No login email"}</p>
          <p className="text-sm text-white/65">Mobile: {c.phones.join(', ') || "Not saved"}</p>
          <p className="mt-2 text-sm text-emerald-200">Squad: {c.teams.map(t => t.name).join(', ')}</p>
          <p className="mt-2 text-xs leading-5 text-amber-100/85">Match evidence: {c.evidence.join(' · ')}</p>
          <Link href={`/admin/players/audit?q=${encodeURIComponent(c.email || c.name || c.userId)}`} className="mt-3 inline-block text-sm text-emerald-200 underline">Inspect registered player</Link>
        </div>)}</div>
        <div className="flex flex-wrap gap-4 text-sm text-emerald-200">
          {r.kind === 'PROSPECT' ? <Link className="underline" href={`/admin/player-prospects/${r.id}/communications`}>Recruitment communications</Link> : <Link className="underline" href={`/admin/leads/${r.id}`}>Open player lead</Link>}
          <Link className="underline" href={`/admin/players/audit?q=${encodeURIComponent(r.email || r.name)}`}>Full identity audit</Link>
        </div>
        {!match.safe ? <details className="rounded-xl border border-amber-400/20 p-4"><summary className="cursor-pointer text-sm font-bold text-amber-100">I have verified the person — reconcile this recruitment record</summary>
          <form action={confirmIdentityAction} className="mt-4 space-y-4 text-sm text-white/75">
            <input type="hidden" name="kind" value={r.kind}/><input type="hidden" name="recordId" value={r.id}/><input type="hidden" name="fingerprint" value={match.fingerprint}/>
            <fieldset className="space-y-2"><legend className="mb-2 font-bold text-white">Choose the existing registered account</legend>{match.candidates.map(c => <label key={c.userId} className="flex gap-3 rounded-xl border border-white/10 p-3"><input type="radio" required name="userId" value={c.userId}/><span className="break-words">{c.name || "Unnamed account"} · {c.email || "No email"} · {c.teams.map(t => t.name).join(', ')}</span></label>)}</fieldset>
            <p>This does not merge accounts, change emails, remove squad memberships or alter payments. It closes only the eligible recruitment overlap and retains the communication history. Existing declined/paused statuses and enquiries assigned to another team remain unchanged.</p>
            <label className="block">How did you verify this is the same person?<textarea name="reason" minLength={10} maxLength={1000} required className="mt-2 block min-h-20 w-full rounded-xl border border-white/20 bg-black/25 p-3" /></label>
            <label className="block">Type <strong>CONFIRM</strong> to continue<input name="confirmation" required pattern="CONFIRM" autoComplete="off" className="mt-2 block w-full max-w-sm rounded-xl border border-white/20 bg-black/25 p-3" /></label>
            <HealthSubmitButton>Confirm existing player and reconcile</HealthSubmitButton>
          </form>
        </details> : null}
      </article>;
    })}</div>}
  </section>;
}
