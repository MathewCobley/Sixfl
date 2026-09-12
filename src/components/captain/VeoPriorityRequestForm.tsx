'use client';

import { useActionState } from 'react';
import { requestVeoPriorityAction, type VeoRequestFormState } from '@/app/captain/team/[teamid]/veo-priority/actions';

export default function VeoPriorityRequestForm({ teamId, leagueId, termsVersion }: { teamId: string; leagueId: string; termsVersion: string }) {
  const initial: VeoRequestFormState = { status: 'idle', message: '' };
  const [state, action, pending] = useActionState(requestVeoPriorityAction.bind(null, teamId, leagueId), initial);
  if (state.status === 'pending' || state.status === 'on') return <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">{state.message}</p>;
  return <form action={action} className="space-y-4">
    <input type="hidden" name="termsVersion" value={termsVersion} />
    <label className="flex items-start gap-3 text-sm leading-6 text-white/80">
      <input type="checkbox" name="agreed" required disabled={pending} className="mt-1 h-5 w-5 shrink-0" />
      <span>I agree to the £5 per-team supplement when our team is allocated to a Veo match after SIXFL approves this request. No allocation means no supplement. Footage may be published publicly on SIXFL TV/YouTube; Priority does not guarantee filming.</span>
    </label>
    {state.status === 'error' && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{state.message}</p>}
    <button type="submit" disabled={pending} className="min-h-11 rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/20 px-5 py-3 font-semibold text-white transition hover:bg-fuchsia-500/30 disabled:cursor-wait disabled:opacity-60">
      {pending ? 'Sending request…' : 'Request Veo Priority'}
    </button>
    <p className="text-xs leading-5 text-white/60">Requesting does not take a payment or change your existing fixtures or fees. SIXFL will review your request.</p>
  </form>;
}
