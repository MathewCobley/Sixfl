"use client";

import { useFormStatus } from "react-dom";

export default function OverturnEmailButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50">
    {pending ? "Queueing notices…" : "Email both teams"}
  </button>;
}
