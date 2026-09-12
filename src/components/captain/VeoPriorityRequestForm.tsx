'use client';

import { useActionState } from 'react';
import { requestVeoPriorityAction, type VeoRequestFormState } from '@/app/captain/team/[teamid]/veo-priority/actions';

type RequestProps = { teamId: string; leagueId: string; termsVersion: string };

// Both views use these fields, so preview copy and controls cannot drift from
// the captain experience. Preview buttons are inert even outside a form.
function RequestFields({ disabled, pending = false, preview = false }: { disabled: boolean; pending?: boolean; preview?: boolean }) {
  return (
    <>
      <label className="flex items-start gap-3 text-sm leading-6 text-white/80">
        <input type="checkbox" name="agreed" required disabled={disabled} className="mt-1 h-5 w-5 shrink-0" />
        <span>I agree to an extra £5 on our team's match fee when we are scheduled on the Veo pitch, after SIXFL approves our request. There is no extra charge otherwise. I understand footage may be published publicly on SIXFL TV/YouTube and filming is not guaranteed for every match.</span>
      </label>
      <button type={preview ? 'button' : 'submit'} disabled={disabled} className="min-h-11 rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/20 px-5 py-3 font-semibold text-white transition hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-70">
        {pending ? 'Sending request…' : 'Request Veo Priority'}
      </button>
      <p className="text-xs leading-5 text-white/60">No payment is taken when you request Priority. If approved, it applies to newly published fixtures only. Your existing fixtures and fees stay the same.</p>
    </>
  );
}

function LiveRequestForm({ teamId, leagueId, termsVersion }: RequestProps) {
  const initial: VeoRequestFormState = { status: 'idle', message: '' };
  const [state, action, pending] = useActionState(requestVeoPriorityAction.bind(null, teamId, leagueId), initial);
  if (state.status === 'pending' || state.status === 'on') {
    return <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">{state.message}</p>;
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="termsVersion" value={termsVersion} />
      {state.status === 'error' && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{state.message}</p>}
      <RequestFields disabled={pending} pending={pending} />
    </form>
  );
}

export default function VeoPriorityRequestForm({ preview = true, ...props }: RequestProps & { preview?: boolean }) {
  // Fail closed: only a server-authorised captain explicitly gets the live form.
  // Do not bind a server action or render a form/hidden action fields in preview.
  // The server action and database service still independently reject previews.
  if (preview) {
    return <div className="space-y-4" data-veo-request-preview="true"><RequestFields disabled preview /></div>;
  }
  return <LiveRequestForm {...props} />;
}
