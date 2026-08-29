"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { sendTeamPlaceConfirmationChaseAction } from "@/app/(admin)/admin/leads/team-confirmation-chase-actions";

export default function LeadConfirmationChaseButton({
  leadId,
  canChase,
}: {
  leadId: string;
  canChase: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!canChase || pending) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("leadId", leadId);

      const result = await sendTeamPlaceConfirmationChaseAction(formData);

      if (!result?.ok) {
        alert(result?.error || "Failed to send the decision reminder.");
        return;
      }

      alert(
        "Decision reminder sent. It uses the same secure link and asks only whether they are entering, their team name and approximate squad size.",
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canChase || pending}
      title="Remind this lead to give SIXFL a clear team decision"
      className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 text-xs font-bold tracking-[0.1em] text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30"
    >
      {pending ? "Sending reminder…" : "Send reminder"}
    </button>
  );
}
