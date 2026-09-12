"use client";

import { useFormStatus } from "react-dom";
import { REFERRAL_INELIGIBILITY_REASONS } from "@/lib/team-referral-eligibility-policy";

function SaveButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
    {pending ? "Saving decision…" : "Confirm not eligible"}
  </button>;
}

export default function ReferralIneligibilityForm({ referralId, teamName, referrerName, action }: {
  referralId: string; teamName: string; referrerName: string; action: (form: FormData) => Promise<void>;
}) {
  return <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
    <summary className="cursor-pointer text-sm font-bold text-red-800">Mark not eligible</summary>
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="referralId" value={referralId}/>
      <p className="text-sm text-slate-700"><strong>{teamName}</strong> · referred by {referrerName}</p>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold text-slate-900">Reason shown to the referrer</legend>
        {REFERRAL_INELIGIBILITY_REASONS.map(reason => <label key={reason.value} className="flex items-start gap-2 text-sm text-slate-800">
          <input className="mt-1" type="radio" name="reasonCode" value={reason.value} required/>{reason.label}
        </label>)}
      </fieldset>
      <label className="block text-sm font-bold text-slate-900">Private admin note
        <textarea name="note" required minLength={10} maxLength={1000} rows={3}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-900"
          placeholder="Record the facts supporting this decision."/>
      </label>
      <p className="text-xs leading-5 text-slate-600">The note stays private. This records a final decision, removes the reward from payable totals, blocks payment details and cancels unsent reward emails. It does not change the team or fixtures. No new email is sent; previously sent messages cannot be recalled.</p>
      <label className="flex items-start gap-2 text-sm text-slate-800">
        <input className="mt-1" type="checkbox" name="confirmed" value="yes" required/>
        I have checked the referral terms and confirm this reward is not eligible.
      </label>
      <SaveButton/>
    </form>
  </details>;
}
