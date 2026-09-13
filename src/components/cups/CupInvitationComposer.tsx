"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import EmailHtmlPreview from "@/components/admin/email/EmailHtmlPreview";
import AdminSelect from "@/components/admin/AdminSelect";
import type { CupAction } from "./types";
type Choice={id:string;teamName:string;league:string;response:string;entered:boolean;eligible:boolean};
type TemplateChoice={id:string;name:string;key:string};
export default function CupInvitationComposer({cupId,teams,templates,previewAction,sendAction}:{cupId:string;teams:Choice[];templates:TemplateChoice[];previewAction:CupAction;sendAction:CupAction}) {
  const [chosen,setChosen]=useState<string[]>([]),[search,setSearch]=useState(""),[kind,setKind]=useState("INITIAL");
  const [preview,prepare,preparing]=useActionState(previewAction,{}),[sent,send,sending]=useActionState(sendAction,{});
  const available=teams.filter(t=>!t.entered && t.eligible && (kind==="REMINDER"?t.response==="PENDING":!["YES","NO"].includes(t.response)));
  const visible=available.filter(t=>(t.teamName+" "+t.league).toLowerCase().includes(search.toLowerCase()));
  const toggle=(ids:string[])=>setChosen(old=>ids.every(id=>old.includes(id))?old.filter(id=>!ids.includes(id)):[...new Set([...old,...ids])]);
  return <section className="space-y-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5">
    <h2 className="text-xl font-semibold">Invite teams / remind unanswered teams</h2>
    <p className="text-sm text-white/60">Cup emails now use your normal Team email templates. Only templates containing the Cup YES / NO response buttons appear here.</p>
    {!templates.length?<p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">Create a normal Team email template and use <strong>Cup YES / NO response</strong> in the template builder before sending. <Link href="/admin/templates/new?type=campaign&channel=EMAIL" className="underline">Create email template</Link>.</p>:null}
    <form action={prepare} className="space-y-4">
      <input type="hidden" name="cupId" value={cupId}/><input type="hidden" name="teamIds" value={JSON.stringify(chosen)}/>
      <AdminSelect name="templateId" label="Email template" options={templates.map(t=>({value:t.id,label:t.name}))} defaultValue={templates[0]?.id||""} required placeholder="Choose a cup email template"/>
      <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Email type</legend>{[["INITIAL","Invitation"],["REMINDER","Reminder — unanswered only"]].map(([value,label])=><label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value={value} checked={kind===value} onChange={()=>{setKind(value);setChosen([]);}}/>{label}</label>)}</fieldset>
      <label className="block text-sm">Find teams or leagues<input value={search} onChange={e=>setSearch(e.target.value)} className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 p-3" placeholder="Search team or league…"/></label>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>toggle(visible.map(t=>t.id))} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Select / clear shown teams</button>{[...new Set(visible.map(t=>t.league))].map(league=><button type="button" key={league} onClick={()=>toggle(visible.filter(t=>t.league===league).map(t=>t.id))} className="rounded-lg border border-white/15 px-3 py-2 text-sm">{league}</button>)}</div>
      <div className="grid max-h-80 gap-2 overflow-y-auto" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,18rem),1fr))"}}>{visible.map(t=><label key={t.id} className="flex items-start gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" checked={chosen.includes(t.id)} onChange={()=>toggle([t.id])} className="mt-1"/><span className="min-w-0 break-words text-sm"><strong>{t.teamName}</strong><br/><span className="text-white/55">{t.league} · {t.response}</span></span></label>)}</div>
      {!visible.length?<p className="text-sm text-white/60">No teams match this selection.</p>:null}
      <p className="text-sm">{chosen.length} team{chosen.length===1?"":"s"} selected. Existing entrants and answered teams are excluded. Reminders are limited to one per team per 24 hours.</p>
      {preview.error?<p role="alert" className="text-rose-200">{preview.error}</p>:null}
      <button disabled={preparing||!chosen.length||!templates.length} className="rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-black disabled:opacity-40">{preparing?"Preparing…":"Preview selected emails"}</button>
    </form>
    {preview.preview?<div className="space-y-4 border-t border-white/15 pt-5"><h3 className="font-semibold">Review {preview.kind==="REMINDER"?"reminders":"invitations"} for {preview.preview.teams.length} teams</h3>
      <p className="text-sm text-white/60">Template: <strong>{preview.preview.templateName}</strong>. These preview buttons are not live response links. Each recipient receives a private team-specific confirmation link when you send.</p>
      {preview.preview.teams.map(t=><details key={t.teamId} className="rounded-xl border border-white/15 p-3"><summary className="cursor-pointer text-sm font-semibold">{t.teamName} — {t.error || `${t.previews.length} recipient(s)`}</summary>
        {t.error?<p className="mt-3 text-sm text-amber-200">{t.error}</p>:t.previews.map(p=><div key={p.email} className="mt-4 min-w-0 space-y-2"><p className="break-all text-sm">To: {p.email}</p><p className="text-sm">{p.subject}</p><EmailHtmlPreview html={p.bodyHtml||""} title={`Cup email preview for ${p.email}`}/></div>)}
      </details>)}
      <form action={send} className="space-y-3"><input type="hidden" name="cupId" value={cupId}/><input type="hidden" name="kind" value={preview.kind}/><input type="hidden" name="teamIds" value={JSON.stringify(preview.teamIds)}/><input type="hidden" name="templateId" value={preview.templateId||preview.preview.templateId||""}/><input type="hidden" name="previewKey" value={preview.preview.previewKey}/>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" required className="mt-1"/>I have reviewed these teams, recipients and cup details and want to send the emails.</label>
        <button disabled={sending} className="rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-black disabled:opacity-40">{sending?"Queuing…":"Send reviewed emails"}</button></form>
    </div>:null}
    {sent.error?<p role="alert" className="text-rose-200">{sent.error}</p>:null}{sent.success?<p role="status" className="text-emerald-200">{sent.success}</p>:null}
    {sent.results?.map(r=><p key={r.teamName} className="text-sm">{r.teamName}: {r.error||`${r.queued} queued · ${r.existing} already recorded · ${r.skipped} blocked/skipped`}</p>)}
  </section>;
}
