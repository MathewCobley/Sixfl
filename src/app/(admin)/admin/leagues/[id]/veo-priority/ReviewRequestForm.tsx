'use client';
import { useActionState } from 'react';
import { reviewVeoPriorityAction, type VeoReviewFormState } from './request-actions';

export default function ReviewRequestForm({ leagueId, requestId }: { leagueId: string; requestId: string }) {
  const initial: VeoReviewFormState = { done: false, error: false, message: '' };
  const [state, action, pending] = useActionState(reviewVeoPriorityAction.bind(null, leagueId, requestId), initial);
  return <form action={action} className="space-y-3">
    {state.message && <p role={state.error ? 'alert' : 'status'} className={`text-sm leading-6 ${state.error ? 'text-red-200' : 'text-emerald-100'}`}>{state.message}</p>}
    {!state.done && <div className="flex flex-wrap gap-3">
      <button type="submit" name="decision" value="APPROVED" disabled={pending} className="min-h-11 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-50">{pending ? 'Saving decision…' : 'Approve Priority request'}</button>
      <button type="submit" name="decision" value="DECLINED" disabled={pending} className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 disabled:opacity-50">Decline request</button>
    </div>}
  </form>;
}
