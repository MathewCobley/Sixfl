import Link from "next/link";
import AdminSelect from "@/components/admin/AdminSelect";
import CupInvitationComposer from "@/components/cups/CupInvitationComposer";
import { requireAdmin } from "@/lib/requireAdmin";
import { getCupInvitationReport } from "@/lib/cups/invitations";
import { cupDate, filterCupRows, responseLabel } from "@/lib/cups/invitation-policy";
import { previewCupMailAction,sendCupMailAction } from "../invitation-actions";
export default async function CupInvitationsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{q?:string;league?:string;response?:string}>}) {
  const access=await requireAdmin(),{id}=await params,filters=await searchParams;
  const {cup,rows,counts}=await getCupInvitationReport(id,access.user?.id||"");
  const filtered=filterCupRows(rows,filters),leagues=[...new Map(rows.filter(r=>r.sourceLeagueId).map(r=>[r.sourceLeagueId!,r.sourceLeagueName||"League"])).entries()];
  const query=new URLSearchParams(Object.entries(filters).filter((e):e is [string,string]=>typeof e[1]==="string")).toString();
  return <div className="space-y-6"><div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fit,minmax(8rem,1fr))"}}>{[["Invited",counts.invited],["Yes — interested",counts.yes],["No",counts.no],["Awaiting response",counts.pending],["Re-invite needed",counts.outdated],["Confirmed entrants",counts.entrants],["Delivery problems",counts.problems]].map(([label,value])=><div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4"><p className="text-xs text-white/55">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <p className="text-sm text-white/60">One response per team. A Yes is interest only; confirm agreed entries separately in Cup entrants. Deadline: {cupDate(cup.settings?.responseDeadline??null)}. Invitation status: {cup.settings?.state||"Not configured"}.</p>
    {cup.settings?.state==="OPEN"?<CupInvitationComposer cupId={id} teams={rows.map(r=>({id:r.id,teamName:r.teamName,league:r.sourceLeagueName||"No current league",response:r.response,entered:r.entered,eligible:r.eligible&&!r.withdrawn}))} previewAction={previewCupMailAction} sendAction={sendCupMailAction}/>:<p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Save the invitation details, choose a deadline and set invitations to Open in <Link href={`/admin/cups/${id}`} className="underline">Cup setup</Link> before sending.</p>}
    <section className="space-y-4"><h2 className="text-xl font-semibold">Response report</h2>
    <form className="grid items-end gap-3" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,12rem),1fr))"}}>
      <label className="text-sm">Team search<input name="q" defaultValue={filters.q} className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 p-3"/></label>
      <AdminSelect key={`league-${filters.league}`} name="league" label="League" defaultValue={filters.league||""} options={[{value:"",label:"All leagues"},...leagues.map(([value,label])=>({value,label}))]}/>
      <AdminSelect key={`response-${filters.response}`} name="response" label="Response" defaultValue={filters.response||""} options={[{value:"",label:"All responses"},...["NOT_INVITED","PENDING","YES","NO","OUTDATED"].map(value=>({value,label:responseLabel(value)})),{value:"PROBLEM",label:"Delivery problems"}]}/>
      <button className="rounded-xl border border-white/20 px-4 py-3 text-sm">Filter report</button>
    </form>
    <div className="flex flex-wrap justify-between gap-3 text-sm"><p>{filtered.length} of {rows.length} teams shown. Summary totals above are for the whole cup.</p><Link href={`/admin/cups/${id}/invitations/export?${query}`} className="text-emerald-300 underline">Export filtered report (CSV)</Link></div>
    {filtered.map(row=><article key={row.id} className="space-y-4 rounded-2xl border border-white/15 bg-white/[0.03] p-5">
      <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,12rem),1fr))"}}><div><h3 className="break-words font-semibold">{row.teamName}</h3><p className="mt-1 text-xs text-white/55">{row.sourceLeagueName||"No current league"}</p></div>
        <div><p className="font-semibold text-emerald-100">{responseLabel(row.response)}</p><p className="mt-1 text-xs text-white/55">{row.entered?"Confirmed entrant":row.withdrawn?"Withdrawn entrant":row.eligible?"Entry not yet confirmed":"Not currently eligible"}</p></div>
        <div className="text-xs leading-5 text-white/60"><p>Invited: {cupDate(row.invitation?.createdAt??null)}</p><p>Responded: {cupDate(row.invitation?.respondedAt??null)}{row.invitation?.respondedByName?` · ${row.invitation.respondedByName}`:""}</p><p>Last reminder: {cupDate(row.invitation?.lastReminderAt??null)}</p></div>
      </div>
      {row.response==="YES"&&!row.entered?<Link href={`/admin/cups/${id}/entrants`} className="inline-block rounded-lg border border-emerald-400/30 px-3 py-2 text-sm text-emerald-200">Review / confirm entry</Link>:null}
      {!row.contacts.length?<p className="text-sm text-amber-200">No current email contact. Add captain/team contact details before inviting.</p>:null}
      <details><summary className="cursor-pointer text-sm text-white/70">Email delivery and contact history ({row.messages.length})</summary><div className="mt-3 space-y-2">
        <p className="break-words text-xs text-white/55">Current contacts: {row.contacts.map(c=>`${c.name} (${c.email})`).join("; ")||"None"}</p>
        {row.messages.map(m=><div key={m.id} className="rounded-xl border border-white/10 p-3 text-xs leading-5"><p className="break-all">{m.recipientName} · {m.recipientEmail}</p><p>{m.kind==="REMINDER"?"Reminder":"Invitation"} · details version {m.settingsVersion} · <strong>{m.status||"Not queued"}</strong> · {cupDate(m.sentAt||m.createdAt)}</p>{m.failureReason?<p className="text-amber-200">{m.failureReason}</p>:null}{m.dispatchId?<Link className="text-emerald-300 underline" href={`/admin/queue/${m.dispatchId}`}>View message status / review retry</Link>:null}</div>)}
      </div></details>
    </article>)}
    {!filtered.length?<p className="text-sm text-white/55">No teams match these filters.</p>:null}</section>
    <Link href={`/admin/cups/${id}/invitations/history`} className="inline-block text-sm text-emerald-300 underline">View cup invitation and entry audit</Link>
  </div>;
}
