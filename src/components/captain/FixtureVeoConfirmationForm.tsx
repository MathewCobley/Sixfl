'use client';

import { useActionState, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  confirmFixtureWithVeoAction,
  stopFutureVeoPriorityAction,
  type FixtureVeoFormState,
} from '@/app/captain/team/[teamid]/veo-priority/fixture-actions';
import type { FixtureVeoOffer } from '@/lib/veo/fixture-bookings';
import { VEO_FIXTURE_TERMS, type VeoFixtureChoice } from '@/lib/veo/fixture-choice';

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

function fixtureDefaultChoice(offer: FixtureVeoOffer): VeoFixtureChoice {
  // A remembered future preference is not consent for this fixture. Only restore a
  // previous choice when this exact fixture already has a request/status of its own.
  return offer.requestStatus ? offer.defaultChoice : 'NONE';
}

function Fields({
  offer,
  disabled,
  onChoice,
}: {
  offer: FixtureVeoOffer;
  disabled: boolean;
  onChoice?: (choice: VeoFixtureChoice) => void;
}) {
  const defaultChoice = fixtureDefaultChoice(offer);

  return (
    <fieldset
      key={offer.version}
      disabled={disabled}
      className="space-y-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4"
    >
      <legend className="px-1 text-base font-bold text-white">
        📹 Want a guaranteed place on the camera pitch?
      </legend>
      <p className="text-sm leading-6 text-white/80">
        Choose <strong>Veo Priority</strong> to secure your match on our camera-equipped
        pitch. <strong>Once SIXFL confirms your booking, your match is guaranteed a place on that pitch.</strong>
      </p>
      <p className="text-sm leading-6 text-white/80">
        <strong>Just £5 extra for the whole team—not per player.</strong>
      </p>

      <div className="space-y-3">
        {[
          [
            'NONE',
            offer.preference ? 'Skip Veo Priority for this match' : 'No thanks — no Veo Priority',
            offer.preference
              ? 'Your match may still be recorded, but a place on the camera pitch is not guaranteed. No extra charge for this match. Your saved preference stays on for future fixtures.'
              : 'Your match may still be recorded, but a place on the camera pitch is not guaranteed. There is no extra charge.',
          ],
          [
            'MATCH',
            'Yes, just this match',
            'Request a guaranteed place on the camera pitch for this fixture only. No ongoing commitment.',
          ],
          [
            'ONGOING',
            'Yes, this and future matches',
            'Request the camera pitch for this fixture and save Veo Priority as our preference for future matches in this league. You can skip an individual match or turn off your saved preference.',
          ],
        ].map(([value, label, help]) => {
          const choice = value as VeoFixtureChoice;
          return (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-white/15 p-3 text-sm text-white"
            >
              <input
                type="radio"
                name="veoChoice"
                value={value}
                defaultChecked={defaultChoice === value}
                onChange={() => onChoice?.(choice)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span>
                <strong className="block">{label}</strong>
                <span className="mt-1 block text-xs leading-5 text-white/65">{help}</span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="text-sm font-semibold text-white">How it works</p>
      <p className="text-xs leading-5 text-white/65">
        Camera-pitch spaces are limited. We will confirm whether your request has been
        accepted—<strong>submitting a request alone does not reserve a space</strong>.
        One-match requests and saved preferences receive the same priority.
      </p>
      <p className="text-xs leading-5 text-white/65">
        By choosing either Yes option, you agree to the £5 team charge if SIXFL accepts
        the filming slot. The <strong>£5 charge is added separately to Team payments when the filming slot is confirmed</strong>.
        If filming fails or no usable recording is produced, the charge is voided and any
        payment received is returned to team credit. Your normal match fee remains unchanged.
      </p>
      <p className="text-xs leading-5 text-white/65">
        Recordings may be published publicly on <strong>SIXFL TV/YouTube</strong>. Teams
        choosing <strong>No thanks</strong> may still be filmed without being charged.
      </p>
    </fieldset>
  );
}

function ChoiceStatus({ offer }: { offer: FixtureVeoOffer | null }) {
  if (!offer) return null;

  const text =
    offer.bookingState === 'READY'
      ? '📹 Your recording is ready. Any accepted £5 Veo charge is shown separately in Team payments.'
      : ['FAILED', 'CANCELLED'].includes(offer.bookingState ?? '')
        ? '📹 Veo recording unavailable. No Veo charge is due; any Veo payment received is returned to team credit.'
        : offer.requestStatus === 'ACCEPTED'
          ? `📹 Veo confirmed for this match.${
              offer.agreedPence === 0
                ? ' This match remains free.'
                : ' The £5 Veo charge has been added separately to Team payments.'
            }`
          : offer.bookingState === 'PLANNED'
            ? '📹 This match is scheduled for filming. You have no accepted paid request, so there is no extra Veo charge for your team.'
            : offer.requestStatus === 'REQUESTED'
              ? '📹 Veo requested — awaiting SIXFL confirmation. No extra charge yet.'
              : offer.requestStatus === 'UNAVAILABLE'
                ? '📹 No Veo space this time. Your usual match fee applies.'
                : offer.reason;

  return text ? (
    <div className="space-y-2">
      <p className="text-sm leading-6 text-fuchsia-100">{text}</p>
      {offer.videoUrl && (
        <a
          href={offer.videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-semibold text-fuchsia-100 underline"
        >
          Watch your match
        </a>
      )}
    </div>
  ) : null;
}

function FormContents({
  props,
  disabled,
  preview,
  onChoice,
}: {
  props: Props;
  disabled: boolean;
  preview: boolean;
  onChoice?: (choice: VeoFixtureChoice) => void;
}) {
  const { offer, confirmed } = props;
  const actionLabel = confirmed
    ? '✓ Confirmed you can play · Update Veo choice'
    : 'Confirm you can play · Save Veo choice';

  return (
    <>
      <ChoiceStatus offer={offer} />
      {confirmed && <p className="font-semibold text-emerald-100">✓ Your team is confirmed to play</p>}
      {offer?.available && <Fields offer={offer} disabled={disabled} onChoice={onChoice} />}
      {(!confirmed || offer?.available) && (
        <button type={preview ? 'button' : 'submit'} disabled={disabled} className={button}>
          {disabled && !preview ? 'Saving…' : actionLabel}
        </button>
      )}
      {!confirmed && (
        <p className="text-xs leading-5 text-white/65">
          Veo Priority is optional. You do not need to select it to confirm your team’s attendance.
        </p>
      )}
    </>
  );
}

function PositiveChoiceConfirmation({
  choice,
  disabled,
  onCancel,
}: {
  choice: Exclude<VeoFixtureChoice, 'NONE'>;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <section
      role="alertdialog"
      aria-labelledby="veo-confirm-title"
      className="space-y-3 rounded-2xl border border-amber-300/35 bg-amber-500/10 p-4 text-amber-50"
    >
      <p id="veo-confirm-title" className="font-semibold">
        Confirm your Veo Priority selection
      </p>
      <p className="text-sm leading-6 text-amber-50/85">
        {choice === 'MATCH'
          ? 'You are requesting Veo Priority for this match. If SIXFL accepts the filming slot, your team will be charged £5.'
          : 'You are requesting Veo Priority for this and future matches. £5 will be charged for each filming slot SIXFL accepts. You can still skip individual matches or turn the future preference off later.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="veoPositiveConfirmed"
          value="yes"
          disabled={disabled}
          className="min-h-11 rounded-xl border border-amber-200/40 bg-amber-300/15 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-300/20 disabled:opacity-60"
        >
          {disabled ? 'Saving…' : 'Yes, confirm Veo Priority'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm text-white/85 disabled:opacity-60"
        >
          Go back
        </button>
      </div>
    </section>
  );
}

function LiveForm(props: Props) {
  const [state, action, pending] = useActionState(
    confirmFixtureWithVeoAction.bind(null, props.teamId, props.fixtureId),
    initial,
  );
  const router = useRouter();
  const [choice, setChoice] = useState<VeoFixtureChoice>(
    props.offer ? fixtureDefaultChoice(props.offer) : 'NONE',
  );
  const [confirmChoice, setConfirmChoice] = useState<Exclude<VeoFixtureChoice, 'NONE'> | null>(null);

  useEffect(() => {
    if (state.message) router.refresh();
  }, [state, router]);

  useEffect(() => {
    setChoice(props.offer ? fixtureDefaultChoice(props.offer) : 'NONE');
    setConfirmChoice(null);
  }, [props.offer?.version]);

  function handleChoice(nextChoice: VeoFixtureChoice) {
    setChoice(nextChoice);
    setConfirmChoice(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (choice === 'NONE') return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const explicitlyConfirmed =
      submitter?.name === 'veoPositiveConfirmed' && submitter.value === 'yes';
    if (!explicitlyConfirmed) {
      event.preventDefault();
      setConfirmChoice(choice);
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="confirmAttendance" value={props.confirmed ? 'no' : 'yes'} />
      <input type="hidden" name="veoTerms" value={VEO_FIXTURE_TERMS} />
      <input type="hidden" name="veoVersion" value={props.offer?.version ?? ''} />
      <Feedback state={state} />
      <FormContents props={props} disabled={pending} preview={false} onChoice={handleChoice} />
      {confirmChoice && (
        <PositiveChoiceConfirmation
          choice={confirmChoice}
          disabled={pending}
          onCancel={() => setConfirmChoice(null)}
        />
      )}
    </form>
  );
}

function LiveStop({ teamId, leagueId }: { teamId: string; leagueId: string }) {
  const [state, action, pending] = useActionState(
    stopFutureVeoPriorityAction.bind(null, teamId, leagueId),
    initial,
  );
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <button
        disabled={pending}
        className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm text-white"
      >
        {pending ? 'Saving…' : 'Turn off future Veo Priority'}
      </button>
      <p className="text-xs leading-5 text-white/60">
        Already accepted bookings and one-match requests stay in place.
      </p>
    </form>
  );
}

export function StopFutureVeoForm({
  preview = true,
  ...props
}: {
  teamId: string;
  leagueId: string;
  preview?: boolean;
}) {
  return preview ? (
    <button
      type="button"
      disabled
      className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70"
    >
      Turn off future Veo Priority
    </button>
  ) : (
    <LiveStop {...props} />
  );
}

export default function FixtureVeoConfirmationForm(props: Props) {
  return (
    <div className="space-y-4">
      {props.preview && (
        <aside
          aria-label="Fixture preview notice"
          className="rounded-xl border border-amber-300/25 p-3 text-sm text-amber-100"
        >
          Preview only — these are the captain’s choices. Nothing can be saved from this preview.
        </aside>
      )}
      {props.preview ? (
        <div data-veo-confirm-preview="true" className="space-y-4">
          <FormContents props={props} disabled preview />
        </div>
      ) : (
        <LiveForm {...props} />
      )}
      {props.offer?.preference && (
        <StopFutureVeoForm
          teamId={props.teamId}
          leagueId={props.leagueId}
          preview={props.preview}
        />
      )}
    </div>
  );
}
