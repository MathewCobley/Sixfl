"use client";

import { useFormStatus } from "react-dom";

export default function GoalOfWeekSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex min-h-12 items-center justify-center rounded-full bg-fuchsia-400 px-6 text-sm font-black text-black transition hover:bg-fuchsia-300 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Saving Goal of the Week…" : "Save Goal of the Week"}
    </button>
  );
}
