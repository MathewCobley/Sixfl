'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/requireAdmin';
import { reviewVeoPriorityRequest, VeoRequestError } from '@/lib/veo/priority-requests';

export type VeoReviewFormState = { done: boolean; error: boolean; message: string };
export async function reviewVeoPriorityAction(leagueId: string, requestId: string, _previous: VeoReviewFormState, form: FormData): Promise<VeoReviewFormState> {
  const { user } = await requireAdmin();
  if (!user?.id) return { done: false, error: true, message: 'Sign in as an administrator to review requests.' };
  const decision = String(form.get('decision') ?? '');
  if (decision !== 'APPROVED' && decision !== 'DECLINED') return { done: false, error: true, message: 'Choose Approve or Decline.' };
  try {
    const teamId = await reviewVeoPriorityRequest({ leagueId, requestId, actorId: user.id, decision });
    revalidatePath(`/admin/leagues/${leagueId}`, 'layout');
    revalidatePath(`/captain/team/${teamId}`);
    return { done: true, error: false, message: decision === 'APPROVED' ? 'Request approved. Existing fees are unchanged. The current team Priority setting is shown below.' : 'Request declined. Priority and existing fees are unchanged.' };
  } catch (error) {
    if (!(error instanceof VeoRequestError)) console.error('Veo Priority request review failed', error);
    return { done: false, error: true, message: error instanceof VeoRequestError ? error.message : 'The decision could not be saved. Please refresh and try again.' };
  }
}
