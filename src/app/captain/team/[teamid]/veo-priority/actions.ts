'use server';

import { revalidatePath } from 'next/cache';

import { requireCaptain } from '@/lib/requireCaptain';

export type VeoRequestFormState = { status: 'idle' | 'error' | 'pending' | 'on'; message: string };

/**
 * Legacy paid-Veo request action retained only so an old open browser tab fails
 * safely after the earned SIXFL TV Priority rollout. New UI no longer offers
 * this action and it never creates a request, preference or charge.
 */
export async function requestVeoPriorityAction(
  teamId: string,
  leagueId: string,
  _previous: VeoRequestFormState,
  _form: FormData,
): Promise<VeoRequestFormState> {
  const access = await requireCaptain(teamId);

  if (access.accessMode !== 'captain' || access.isAdmin || !access.isCaptain || !access.user?.id) {
    return {
      status: 'error',
      message: 'Captain previews are read-only. No SIXFL TV Priority change was made.',
    };
  }

  revalidatePath(`/captain/team/${teamId}`);
  revalidatePath(`/admin/leagues/${leagueId}`, 'layout');

  return {
    status: 'error',
    message:
      'Paid Veo Priority has ended. SIXFL TV Priority is now free and earned automatically from your team score.',
  };
}
