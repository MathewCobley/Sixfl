import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { getCupInvitationReport } from "@/lib/cups/invitations";
import CupEntryForm from "@/components/cups/CupEntryForm";
import { changeCupEntryAction } from "../invitation-actions";
export default async function CupEntrantsPage({params}:{params:Promise<{id:string}>}) {
  const access=await requireAdmin(),{id}=await params,{rows}=await getCupInvitationReport(id,access.user?.id||"");
  const entrants=rows.filter(r=>r.entered),available=rows.filter(r=>r.eligible&&!r.entered);
  const groups=[...new Set(entrants.map(r=>r.sourceLeagueName||"Source league not identified"))];
  return <div className="space-y-6"><nav aria-label="Cup entrants views" className="flex flex-wrap gap-3 text-sm"><Link aria-current="page" href={`/admin/cups/${id}/entrants`} className="rounded-xl bg-emerald-400/15 px-4 py-3 text-emerald-100">Entrants ({entrants.length})</Link><Link href={`/admin/cups/${id}/entrants/draw`} className="rounded-xl border border-white/15 px-4 py-3">Draw & rounds</Link></nav>
    <section className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-5"><h2 className="text-xl font-semibold">Confirm an entrant</h2><p className="text-sm leading-6 text-white/60">Interested teams are not entered automatically. Agree the final arrangements first. This adds a separate cup membership only; it never moves the team from its normal league or creates a charge. Existing manual entrants remain entered without inventing a Yes response.</p>
      <CupEntryForm cupId={id} action={changeCupEntryAction} options={available.map(t=>({value:t.id,label:`${t.response==="YES"?"Interested — ":"Manual entry — "}${t.teamName} · ${t.sourceLeagueName||"League"}`}))}/></section>
    <h2 className="text-xl font-semibold">Confirmed cup entrants</h2>
    {groups.map(group=><section key={group} className="space-y-3"><h3 className="text-emerald-200">{group}</h3>{entrants.filter(r=>(r.sourceLeagueName||"Source league not identified")===group).map(t=><article key={t.id} className="space-y-3 rounded-xl border border-white/15 p-4"><h4 className="font-semibold">{t.teamName}</h4><details><summary className="cursor-pointer text-xs text-white/55">Withdraw this entrant</summary><div className="mt-3"><CupEntryForm cupId={id} teamId={t.id} action={changeCupEntryAction}/></div></details></article>)}</section>)}
    {!entrants.length?<p className="rounded-xl border border-dashed border-white/20 p-5 text-sm text-white/55">No confirmed entrants yet. Review the Yes responses and confirm teams once arrangements are agreed.</p>:null}
  </div>;
}
