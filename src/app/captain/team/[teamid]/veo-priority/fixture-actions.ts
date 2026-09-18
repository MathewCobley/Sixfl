'use server';

import { revalidatePath } from 'next/cache';
import { requireCaptain } from '@/lib/requireCaptain';
import {
  confirmCaptainAttendance,
  stopFutureVeoPriority,
  VeoBookingError,
} from '@/lib/veo/fixture-bookings';

export type FixtureVeoFormState = {
  ok: boolean;
  attendanceConfirmed: boolean;
  message: string;
};

function refresh(teamId: string) {
  revalidatePath(`/captain/team/${teamId}`, 'layout');
  revalidatePath('/admin/leagues', 'layout');
  revalidatePath('/admin/fixtures');
}

export async function confirmFixtureWithVeoAction(
  teamId: string,
  fixtureId: string,
  _previous: FixtureVeoFormState,
  form: FormData,
): Promise<FixtureVeoFormState> {
  const access = await requireCaptain(teamId);
  const canAct =
    !!access.user?.id &&
    (access.isAdmin || (access.accessMode === 'captain' && access.isCaptain));

  if (!canAct) {
    return {
      ok: false,
      attendanceConfirmed: false,
      message: 'Preview only — no confirmation or request has been sent.',
    };
  }

  let attendanceConfirmed = false;
  try {
    if (form.get('confirmAttendance') === 'yes') {
      await confirmCaptainAttendance(fixtureId, teamId, access.user!.id);
      attendanceConfirmed = true;
    }

    refresh(teamId);
    return {
      ok: true,
      attendanceConfirmed,
      message: attendanceConfirmed
        ? 'Your team is confirmed to play. On-time confirmation contributes to your SIXFL TV Priority Score.'
        : 'Your team is already confirmed. SIXFL TV Priority is calculated automatically with no extra filming fee.',
    };
  } catch (error) {
    refresh(teamId);
    if (!(error instanceof VeoBookingError)) {
      console.error('Fixture confirmation could not be completed', error);
    }
    return {
      ok: false,
      attendanceConfirmed,
      message:
        error instanceof VeoBookingError
          ? error.message
          : 'Please refresh and try again. Your match fee has not changed.',
    };
  }
}

export async function stopFutureVeoPriorityAction(
  teamId: string,
  leagueId: string,
  _previous: FixtureVeoFormState,
): Promise<FixtureVeoFormState> {
  const access = await requireCaptain(teamId);
  const canAct =
    !!access.user?.id &&
    (access.isAdmin || (access.accessMode === 'captain' && access.isCaptain));

  if (!canAct) {
    return {
      ok: false,
      attendanceConfirmed: false,
      message: 'Preview only — no preference was changed.',
    };
  }

  try {
    await stopFutureVeoPriority(teamId, leagueId, access.user!.id);
    refresh(teamId);
    return {
      ok: true,
      attendanceConfirmed: false,
      message:
        'The old saved Veo preference is off. SIXFL TV Priority is now earned automatically from the team score.',
    };
  } catch (error) {
    return {
      ok: false,
      attendanceConfirmed: false,
      message:
        error instanceof VeoBookingError
          ? error.message
          : 'Could not save the preference. Please try again.',
    };
  }
}
