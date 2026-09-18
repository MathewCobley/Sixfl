'use server';

import { requireAdmin } from '@/lib/requireAdmin';

export type NightBoardVeoPriorityItem = {
  fixtureId: string;
  teamId: string;
  teamName: string;
  homeName: string;
  awayName: string;
  kickoffAt: string;
  choice: string | null;
};

export async function loadNightBoardVeoPriorities(_input: {
  date: string;
  leagueId?: string;
  venueId?: string;
}): Promise<NightBoardVeoPriorityItem[]> {
  await requireAdmin();
  return [];
}
