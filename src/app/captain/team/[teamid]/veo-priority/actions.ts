'use server';

import { revalidatePath } from 'next/cache';
import { requireCaptain } from '@/lib/requireCaptain';
import { requestVeoPriority, VeoRequestError } from '@/lib/veo/priority-requests';

export type VeoRequestFormState = { status: 'idle' | 'error' | 'pending' | 'on'; message: string };

export async function requestVeoPriorityAction(teamId: string, leagueId: string, _previous: VeoRequestFormState, form: FormData): Promise<VeoRequestFormState> {
  const access = await requireCaptain(teamId);
  if (access.accessMode !== 'captain' || access.isAdmin || !access.isCaptain || !access.user?.id) {
    return { status: 'error', message: 'Captain previews are read-only. The team captain must submit their own request.' };
  }
  try {
    const result = await requestVeoPriority({ teamId, leagueId, actorId: access.user.id,
      agreed: form.get('agreed') === 'on', termsVersion: String(form.get('termsVersion') ?? '') });
    revalidatePath(`/captain/team/${teamId}`);
    revalidatePath(`/admin/leagues/${leagueId}`, 'layout');
    return result === 'ON'
      ? { status: 'on', message: 'Veo Priority is already ON for your team.' }
      : { status: 'pending', message: 'Request received — awaiting SIXFL approval. Your fees have not changed.' };
  } catch (error) {
    if (!(error instanceof VeoRequestError)) console.error('Veo Priority request failed', error);
    return { status: 'error', message: error instanceof VeoRequestError ? error.message : 'Your request could not be saved. Please try again. Your fees have not changed.' };
  }
}
