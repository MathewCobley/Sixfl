"use client";
import { useActionState } from "react";
import AdminSelect from "@/components/admin/AdminSelect";
import type { CupAction } from "./types";
export default function CupEntryForm({cupId,teamId,options,action}:{cupId:string;teamId?:string;options?:Array<{value:string;label:string}>;action:CupAction}) {
  const [state,submit,pending]=useActionState(action,{}),remove=!!teamId;
  return <form action={submit} className="space-y-3"><input type="hidden" name="cupId" value={cupId}/><input type="hidden" name="operation" value={remove?"remove":"add"}/>
    {remove?<input type="hidden" name="teamId" value={teamId}/>:<AdminSelect name="teamId" label="Team to confirm" options={options||[]} required/>}
    <label className="flex items-start gap-2 text-sm text-white/65"><input type="checkbox" required name="confirmed" className="mt-1"/>{remove?"Confirm withdrawal from this cup only.":"I have agreed the final arrangements with this team and want to confirm its cup entry."}</label>
    <button disabled={pending} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${remove?"border-rose-400/30 text-rose-200":"border-emerald-400/30 bg-emerald-400/15 text-emerald-100"}`}>{pending?"Saving…":remove?"Withdraw entrant":"Confirm entry"}</button>
    {state.error?<p role="alert" className="text-sm text-rose-200">{state.error}</p>:null}{state.success?<p role="status" className="text-sm text-emerald-200">{state.success}</p>:null}
  </form>;
}
