"use client";

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  COLLECTION_SAVE_UNCONFIRMED,
  collectionErrorMessage,
  validateSquadCollectionAmounts,
  type CollectionFeedback,
} from "@/lib/payments/squad-collection-form";

type Props = {
  action: (data: FormData) => void | Promise<void>;
  saveAction: (data: FormData) => Promise<CollectionFeedback>;
  reviewHref: string;
  children: ReactNode;
  className?: string;
};

export default function SquadPaymentCollectionForm({ action, saveAction, reviewHref, children, className }: Props) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<CollectionFeedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const inFlight = useRef(false);
  const needsReview = useRef(false);
  const pending = saving || refreshing;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || pending || needsReview.current) return;
    // Read only this component's owned form, including its server-rendered inputs.
    // Disabled protected rows are intentionally omitted; the server preserves them.
    const data = new FormData(event.currentTarget);
    const invalid = validateSquadCollectionAmounts(data);
    if (invalid) {
      setFeedback({ status: "error", message: collectionErrorMessage(invalid.code)!, field: invalid.field });
      return;
    }
    if (!data.getAll("player").length) {
      setFeedback({ status: "error", message: collectionErrorMessage("no_players")! });
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await saveAction(data);
      if (!result || !["saved", "error", "unconfirmed"].includes(result.status)) throw new Error("Missing collection acknowledgement");
      needsReview.current = result.status === "unconfirmed";
      setFeedback(result);
      if (result.status === "saved") startTransition(() => router.refresh());
    } catch {
      needsReview.current = true;
      setFeedback({ status: "unconfirmed", message: COLLECTION_SAVE_UNCONFIRMED });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <form action={action} noValidate onSubmit={submit} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {children}
        <div className="space-y-3">
          <button
            type="submit"
            disabled={pending || feedback?.status === "unconfirmed"}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving player collection…" : "Save player collection"}
          </button>
          <div aria-live="polite" aria-atomic="true">
            {pending ? <p className="text-sm text-white/75" role="status">Saving — please wait. Do not refresh or submit again.</p> : null}
            {!pending && feedback ? (
              <p role={feedback.status === "saved" ? "status" : "alert"} className={`rounded-xl border p-3 text-sm leading-6 ${feedback.status === "saved" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
                {feedback.message}
              </p>
            ) : null}
          </div>
          {feedback?.status === "unconfirmed" ? (
            <a href={reviewHref} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-emerald-200 underline">Open saved collection to check</a>
          ) : null}
          <p className="text-xs leading-5 text-white/55">Protected balances stay unchanged. A saved collection is not confirmation that payment emails were delivered.</p>
        </div>
      </fieldset>
    </form>
  );
}
