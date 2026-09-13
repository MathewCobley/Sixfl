"use client";
import { useActionState } from "react";
import type { CupAction } from "./types";
export default function CupResponseForm({action,fields,response,initialAnswer,version}:{action:CupAction;fields:Record<string,string>;response:string;initialAnswer?:string;version:number}) {
  const [state,submit,pending]=useActionState(action,{});
  return <form action={submit} className="space-y-4 border-t border-white/15 pt-5">{Object.entries(fields).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<input type="hidden" name="version" value={version}/>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">Your team's response</legend>{[["YES","Yes — our team is interested"],["NO","No — not this time"]].map(([value,label])=><label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/20 p-4"><input type="radio" name="response" value={value} required defaultChecked={(initialAnswer||response)===value}/><span>{label}</span></label>)}</fieldset>
    <label className="flex items-start gap-3 text-sm text-white/70"><input type="checkbox" name="confirmed" required className="mt-1"/>I am responding on behalf of this team. A Yes registers interest only, not a confirmed entry or a charge.</label>
    {state.error?<p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{state.error}</p>:null}{state.success?<p role="status" className="rounded-xl bg-emerald-400/10 p-3 text-sm text-emerald-200">{state.success}</p>:null}
    <button disabled={pending} className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-40">{pending?"Saving…":"Confirm team response"}</button>
  </form>;
}
