"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

// Refresh server data only. Never call the send action or run the queue.
export default function RefreshPaymentWarningStatus() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-50">
    {pending ? "Refreshing…" : "Refresh warning status"}
  </button>;
}
