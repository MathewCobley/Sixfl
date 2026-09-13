"use client";
import { useActionState } from "react";
import AdminSelect from "@/components/admin/AdminSelect";
import type { CupAction } from "./types";
const field="mt-2 block w-full rounded-xl border border-white/15 bg-black/30 p-3 text-white";
export default function CupSetupForm({cupId,values,action}:{cupId:string;values:{version:number;fee:string;venueNote:string;scheduleNote:string;deadlineDate:string;deadlineTime:string;state:string};action:CupAction}) {
  const [state,submit,pending]=useActionState(action,{});
  return <form action={submit} className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Invitation details</h2>
    <p className="text-sm leading-6 text-white/60">Yes means interested, not a confirmed entry. No charge is created. Save these details before inviting teams. Changing the fee, locations, scheduling details or deadline requires a revised invitation. Closing or reopening invitations without changing those details preserves the responses.</p>
    <input type="hidden" name="cupId" value={cupId}/><input type="hidden" name="version" value={values.version}/>
    <div className="grid gap-5" style={{gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,18rem),1fr))"}}>
      <label className="text-sm">Cost per team per match (£)<input name="fee" required inputMode="decimal" defaultValue={values.fee} className={field}/></label>
      <AdminSelect name="state" label="Invitations" defaultValue={values.state} options={[{value:"DRAFT",label:"Draft — do not send"},{value:"OPEN",label:"Open — accepting responses"},{value:"CLOSED",label:"Closed"}]}/>
      <label className="text-sm">Response deadline date (UK time)<input type="date" name="deadlineDate" required defaultValue={values.deadlineDate} className={field}/></label>
      <label className="text-sm">Response deadline time (UK time)<input type="time" name="deadlineTime" required defaultValue={values.deadlineTime} className={field}/></label>
    </div>
    <label className="block text-sm">Locations — state clearly when proposed<textarea name="venueNote" required maxLength={1000} rows={2} defaultValue={values.venueNote} className={field}/></label>
    <label className="block text-sm">Match nights, dates and kick-off information<textarea name="scheduleNote" required maxLength={1500} rows={3} defaultValue={values.scheduleNote} className={field}/></label>
    {state.error?<p role="alert" className="text-rose-200">{state.error}</p>:null}{state.success?<p role="status" className="text-emerald-200">{state.success}</p>:null}
    <button disabled={pending} className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{pending?"Saving…":"Save invitation details"}</button>
  </form>;
}
