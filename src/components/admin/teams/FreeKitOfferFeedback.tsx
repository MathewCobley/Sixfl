"use client";

import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";

const messages: Record<string, { success: boolean; text: string }> = {
  granted: { success: true, text: "Free kit offer turned on. The original registration and existing payments are unchanged." },
  removed: { success: true, text: "Free kit offer turned off. Paid kit ordering remains available, and the original registration is preserved." },
  unchanged: { success: true, text: "The offer is already set this way. No additional change was made." },
  confirm_required: { success: false, text: "Tick the confirmation box before saving." },
  reason_required: { success: false, text: "Give a short reason for turning the offer off (up to 500 characters)." },
  stale_offer: { success: false, text: "The team details changed. Check the current offer below before trying again." },
  offer_in_use: { success: false, text: "A kit order or kit payment already exists. Review it in Admin Kits before changing the offer. No order, payment or entitlement was changed." },
  invalid_request: { success: false, text: "Choose a valid offer setting and try again." },
  missing_team: { success: false, text: "This team could not be found. No change was saved." },
  save_failed: { success: false, text: "The change could not be saved. Reload to check the current offer before trying again." },
};

export default function FreeKitOfferFeedback() {
  const result = useSearchParams().get("freeKit") || "";
  const message = messages[result];
  if (!message) return null;
  return <p role={message.success ? "status" : "alert"} className={`mb-4 rounded-xl border p-3 text-sm leading-6 ${message.success ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : "border-red-400/25 bg-red-500/10 text-red-100"}`}>{message.text}</p>;
}

export function FreeKitOfferSubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${enabled ? "border-emerald-400 bg-emerald-400 text-black hover:bg-emerald-300" : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15"}`}>
    {pending ? "Saving…" : enabled ? "Turn on free kit offer" : "Turn off free kit offer"}
  </button>;
}
