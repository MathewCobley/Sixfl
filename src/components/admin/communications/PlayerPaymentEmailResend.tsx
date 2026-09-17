"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { resendPlayerPaymentEmailAction } from "@/app/(admin)/admin/teams/[id]/players/[membershipId]/communications/resend-actions";

type Props = {
  teamId: string;
  membershipId: string;
  referenceType: "message" | "dispatch";
  referenceId: string;
  recipientEmail: string;
};

export default function PlayerPaymentEmailResend(props: Props) {
  // Reset disclosure, confirmation and action feedback together when the exact
  // player/message/recipient context changes. Never reuse another item's state.
  const contextKey = JSON.stringify([
    props.teamId, props.membershipId, props.referenceType, props.referenceId, props.recipientEmail,
  ]);
  return <PlayerPaymentEmailResendControl key={contextKey} {...props} />;
}

function PlayerPaymentEmailResendControl({ teamId, membershipId, referenceType, referenceId, recipientEmail }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState(resendPlayerPaymentEmailAction, { ok: false, message: "" });
  useEffect(() => { if (state.ok && state.dispatchId) router.refresh(); }, [state.ok, state.dispatchId, router]);

  return (
    <div className="space-y-3">
      {/* The native disclosure is closed initially. Opening it never submits a
          form; all payment/identity/confirmation safeguards remain unchanged. */}
      <details className="group/player-resend">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="transition-transform group-open/player-resend:rotate-90">▸</span>
          Resend options
        </summary>
        <form action={action} className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <input type="hidden" name="referenceType" value={referenceType} />
          <input type="hidden" name="referenceId" value={referenceId} />
          <input type="hidden" name="expectedEmail" value={recipientEmail} />
          <p className="break-all text-sm text-white/75">Resend to <strong>{recipientEmail}</strong></p>
          <p className="mt-2 text-xs leading-5 text-white/60">Checks that this payment is still due and the link is current. Does not create another charge or change the original email.</p>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-white/75">
            <input type="checkbox" name="confirmed" required disabled={pending || state.ok} />
            <span>I have checked the recipient and want to resend this payment email.</span>
          </label>
          <button type="submit" disabled={pending || state.ok} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/15 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
            {pending ? "Queuing…" : state.ok ? "Resend recorded" : "Resend payment email"}
          </button>
        </form>
      </details>
      {/* Queued, duplicate and blocked feedback must not disappear when closed. */}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm leading-6 ${state.ok ? "text-emerald-100" : "text-red-100"}`}>{state.message}</p> : null}
    </div>
  );
}
