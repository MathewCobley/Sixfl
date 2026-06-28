// ========================================
// File: src/components/admin/leads/LeadConfirmationQuickSendButton.tsx
// ========================================

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendTeamPlaceConfirmationSystemEmailAction } from "@/app/(admin)/admin/leads/[id]/response-email-actions";

export default function LeadConfirmationQuickSendButton({
  leadId,
  canSend,
  alreadySent = false,
}: {
  leadId: string;
  canSend: boolean;
  alreadySent?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!canSend || pending) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("leadId", leadId);

      const result = await sendTeamPlaceConfirmationSystemEmailAction(formData);

      if (!result?.ok) {
        alert(result?.error || "Failed to send confirmation email.");
        return;
      }

      alert("Confirmation email sent.");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canSend || pending}
      title={canSend ? "Send team place confirmation email" : "Set an email and prospective league before sending"}
      className="inline-flex h-9 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 text-xs font-bold tracking-[0.12em] text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
    >
      {pending ? "Sending" : alreadySent ? "Resend link" : "Send link"}
    </button>
  );
}
