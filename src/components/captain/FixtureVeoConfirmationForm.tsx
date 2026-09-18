'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import {
  confirmFixtureWithVeoAction,
  type FixtureVeoFormState,
} from '@/app/captain/team/[teamid]/veo-priority/fixture-actions';
import type { FixtureVeoOffer } from '@/lib/veo/fixture-bookings';

type Props = {
  teamId: string;
  fixtureId: string;
  leagueId: string;
  confirmed: boolean;
  offer: FixtureVeoOffer | null;
  preview: boolean;
};

const initial: FixtureVeoFormState = {
  ok: false,
  attendanceConfirmed: false,
  message: '',
};

const button =
  'min-h-12 w-full rounded-xl border border-emerald-300/30 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60';

function Feedback({ state }: { state: FixtureVeoFormState }) {
  return state.message ? (
    <p
      role={state.ok ? 'status' : 'alert'}
      className={`rounded-xl border p-3 text-sm leading-6 ${
        state.ok
          ? 'border-emerald-300/30 text-emerald-100'
          : 'border-amber-300/30 text-amber-100'
      }`}
    >
      {state.message}
    </p>
  ) : null;
}

function FilmingStatus({ offer }: { offer: FixtureVeoOffer | null }) {
  if (!offer) return null;

  const text =
    offer.bookingState === 'READY'
      ? '📹 Your SIXFL TV recording is ready.'
      : ['FAILED', 'CANCELLED'].includes(offer.bookingState ?? '')
        ? '📹 This recording is unavailable.'
        : offer.bookingState === 'PLANNED' || offer.requestStatus === 'ACCEPTED'
          ? '📹 This match is confirmed for filming.'
          : 'SIXFL TV Priority is earned automatically from your team score. There is no opt-in or extra filming fee.';

  return (
    <div className="space-y-2 rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/10 p-4">
      <p className="text-sm leading-6 text-fuchsia-100">{text}</p>
      {offer.videoUrl ? (
        <a
          href={offer.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-semibold text-fuchsia-100 underline"
        >
          Watch your match
        </a>
      ) : null}
    </div>
  );
}

function LiveForm(props: Props) {
  const [state, action, pending] = useActionState(
    confirmFixtureWithVeoAction.bind(null, props.teamId, props.fixtureId),
    initial,
  );
  const router = useRouter();

  useEffect(() => {
    if (state.message) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="confirmAttendance" value={props.confirmed ? 'no' : 'yes'} />
      <Feedback state={state} />
      <FilmingStatus offer={props.offer} />
      {props.confirmed ? (
        <p className="font-semibold text-emerald-100">✓ Your team is confirmed to play</p>
      ) : (
        <>
          <button disabled={pending} className={button}>
            {pending ? 'Saving…' : 'Confirm you can play'}
          </button>
          <p className="text-xs leading-5 text-white/65">
            Confirming on time contributes to your SIXFL TV Priority Score. Recorded-pitch
            allocation is automatic and free; there is no SIXFL TV Priority purchase or filming fee.
          </p>
        </>
      )}
    </form>
  );
}

export default function FixtureVeoConfirmationForm(props: Props) {
  if (props.preview) {
    return (
      <div className="space-y-4">
        <aside
          aria-label="Fixture preview notice"
          className="rounded-xl border border-amber-300/25 p-3 text-sm text-amber-100"
        >
          Preview only — nothing can be saved from this view.
        </aside>
        <FilmingStatus offer={props.offer} />
        {props.confirmed ? (
          <p className="font-semibold text-emerald-100">✓ Your team is confirmed to play</p>
        ) : (
          <button type="button" disabled className={button}>
            Confirm you can play
          </button>
        )}
      </div>
    );
  }

  return <LiveForm {...props} />;
}
