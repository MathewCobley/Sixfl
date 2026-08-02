"use client";

import { useFormStatus } from "react-dom";

export default function MergePlayerSubmitButton({
  keptLabel,
  duplicateLabel,
}: {
  keptLabel: string;
  duplicateLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-red-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-red-300 disabled:cursor-wait disabled:bg-red-300/60 disabled:text-black/65"
    >
      {pending
        ? "Merging accounts… please wait"
        : `Keep ${keptLabel} — merge and disable ${duplicateLabel}`}
    </button>
  );
}
