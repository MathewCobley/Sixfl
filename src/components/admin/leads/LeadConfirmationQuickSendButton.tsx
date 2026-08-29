// ========================================
// File: src/components/admin/leads/LeadConfirmationQuickSendButton.tsx
// ========================================

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { sendTeamCommitmentEmailAction } from "@/app/(admin)/admin/leads/team-commitment-email-actions";
import { sendLeadReassuranceEmailAction } from "@/app/(admin)/admin/leads/reassurance-email-actions";

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
  const [sendingReassurance, startReassuranceTransition] = useTransition();
  const [sendingDecision, startDecisionTransition] = useTransition();
  const pending = sendingReassurance || sendingDecision;

  function handleReassuranceClick() {
    if (!canSend || pending) return;

    startReassuranceTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId);

      const result = await sendLeadReassuranceEmailAction(formData);

      if (!result?.ok) {
        alert(result?.error || "Failed to send the reassurance email.");
        return;
      }

      const emailStatus = result.status ?? "UNKNOWN";
      const smsStatus = result.smsStatus ?? "UNKNOWN";
      const smsFailureReason = result.smsFailureReason ?? null;

      const emailMessage =
        emailStatus === "QUEUED"
          ? "Reassurance email queued."
          : `The reassurance email was ${emailStatus.toLowerCase()}.`;

      const smsMessage =
        smsStatus === "QUEUED"
          ? "The inbox-check SMS was also queued automatically."
          : smsStatus === "NO_PHONE"
            ? "No SMS was sent because this lead has no phone number."
            : smsStatus === "EMAIL_NOT_QUEUED"
              ? "The SMS was not sent because the email was not queued."
              : smsStatus === "FAILED_TO_QUEUE"
                ? "The email was queued, but the automatic SMS could not be queued."
                : smsStatus === "SKIPPED"
                  ? `The email was queued, but the SMS was skipped${smsFailureReason ? `: ${smsFailureReason}` : "."}`
                  : `SMS status: ${smsStatus.toLowerCase()}.`;

      alert(`${emailMessage} ${smsMessage}`);
      router.refresh();
    });
  }

  function handleDecisionClick() {
    if (!canSend || pending) return;

    startDecisionTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadId);

      const result = await sendTeamCommitmentEmailAction(formData);

      if (!result?.ok) {
        alert(result?.error || "Failed to send the team commitment email.");
        return;
      }

      alert(
        alreadySent
          ? "Commitment link resent. It asks only for their decision, team name and approximate squad size."
          : "Commitment link sent. It asks only for their decision, team name and approximate squad size.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleReassuranceClick}
        disabled={!canSend || pending}
        title={
          canSend
            ? "Send the league reassurance email and automatic inbox-check SMS"
            : "Set an email and prospective league before sending"
        }
        className="inline-flex min-h-9 max-w-[150px] items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-center text-xs font-bold leading-4 tracking-[0.08em] text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
      >
        {sendingReassurance ? "Sending…" : "Reassurance email"}
      </button>

      <button
        type="button"
        onClick={handleDecisionClick}
        disabled={!canSend || pending}
        title={
          canSend
            ? "Send the secure team commitment link"
            : "Set an email and prospective league before sending"
        }
        className="inline-flex min-h-9 max-w-[150px] items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-center text-xs font-bold leading-4 tracking-[0.12em] text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
      >
        {sendingDecision
          ? "Sending…"
          : alreadySent
            ? "Resend decision link"
            : "Send decision link"}
      </button>
    </div>
  );
}
