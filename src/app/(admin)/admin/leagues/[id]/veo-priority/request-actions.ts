'use server';

import { requireAdmin } from '@/lib/requireAdmin';

export type VeoReviewFormState = { done: boolean; error: boolean; message: string };

export async function reviewVeoPriorityAction(
  _leagueId: string,
  _requestId: string,
  _previous: VeoReviewFormState,
  _form: FormData,
): Promise<VeoReviewFormState> {
  await requireAdmin();
  return {
    done: true,
    error: false,
    message: 'Paid Veo Priority requests are retired. No request, fee or team Priority setting was changed.',
  };
}
