// ========================================
// File: src/components/admin/leads/LeadConfirmationQuickSendButton.tsx
// ========================================

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { sendTeamCommitmentEmailAction } from "@/app/(admin)/admin/leads/team-commitment-email-actions";
import { sendLeadReassuranceEmailAction } from "@/app/(admin)/admin/leads/reassurance-email-actions";

type SmsStatusTone = "muted" | "info" | "success" | "warning" | "danger";

type SmsStatusLine = {
  text: string;
  tone: SmsStatusTone;
  title?: string | null;
};

type TeamLeadSmsStatus = {
  lines: SmsStatusLine[];
};

type TeamLeadSmsStatusResponse = {
  ok: boolean;
  statuses?: Record<string, TeamLeadSmsStatus>;
};

let sharedStatusRequest: Promise<Record<string, TeamLeadSmsStatus>> | null = null;

async function loadTeamLeadSmsStatuses(force = false) {
  if (force) sharedStatusRequest = null;

  if (!sharedStatusRequest) {
    sharedStatusRequest = fetch("/api/admin/leads/team-confirmation-sms-status", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`SMS status request failed (${response.status}).`);
        }

        const payload = (await response.json()) as TeamLeadSmsStatusResponse;
        if (!payload.ok || !payload.statuses) {
          throw new Error("SMS status response was incomplete.");
        }

        return payload.statuses;
      })
      .catch((error) => {
        sharedStatusRequest = null;
        throw error;
      });
  }

  return sharedStatusRequest;
}

function statusToneClass(tone: SmsStatusTone) {
  if (tone === "success") return "text-emerald-200/90";
  if (tone === "danger") return "text-rose-200/90";
  if (tone === "warning") return "text-amber-200/90";
  if (tone === "info") return "text-sky-200/85";
  return "text-white/45";
}

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
  const [smsStatus, setSmsStatus] = useState<TeamLeadSmsStatus | null>(null);
  const [smsStatusFailed, setSmsStatusFailed] = useState(false);
  const pending = sendingReassurance || sendingDecision;

  async function refreshSmsStatus(force = false) {
    try {
      const statuses = await loadTeamLeadSmsStatuses(force);
      setSmsStatus(statuses[leadId] ?? null);
      setSmsStatusFailed(false);
    } catch (error) {
      console.error("Team lead automatic SMS status could not be loaded", error);
      setSmsStatusFailed(true);
    }
  }

  useEffect(() => {
    let active = true;

    void loadTeamLeadSmsStatuses()
      .then((statuses) => {
        if (!active) return;
        setSmsStatus(statuses[leadId] ?? null);
        setSmsStatusFailed(false);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Team lead automatic SMS status could not be loaded", error);
        setSmsStatusFailed(true);
      });

    return () => {
      active = false;
    };
  }, [leadId]);

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
      const smsStatusValue = result.smsStatus ?? "UNKNOWN";
      const smsFailureReason = result.smsFailureReason ?? null;
      const emailVersion =
        result.leagueMode === "LIVE"
          ? "Live-league reassurance email"
          : "New-league reassurance email";

      const emailMessage =
        emailStatus === "QUEUED"
          ? `${emailVersion} queued.`
          : `The ${emailVersion.toLowerCase()} was ${emailStatus.toLowerCase()}.`;

      const smsMessage =
        smsStatusValue === "QUEUED"
          ? "The inbox-check SMS was also queued automatically."
          : smsStatusValue === "NO_PHONE"
            ? "No SMS was sent because this lead has no phone number."
            : smsStatusValue === "EMAIL_NOT_QUEUED"
              ? "The SMS was not sent because the email was not queued."
              : smsStatusValue === "FAILED_TO_QUEUE"
                ? "The email was queued, but the automatic SMS could not be queued."
                : smsStatusValue === "SKIPPED"
                  ? `The email was queued, but the SMS was skipped${smsFailureReason ? `: ${smsFailureReason}` : "."}`
                  : `SMS status: ${smsStatusValue.toLowerCase()}.`;

      alert(`${emailMessage} ${smsMessage}`);
      await refreshSmsStatus(true);
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
      await refreshSmsStatus(true);
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
            ? "Send the correct new-league or live-league reassurance email, plus the automatic inbox-check SMS"
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

      {smsStatus?.lines.length ? (
        <div
          className="mt-1 w-full max-w-[190px] rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right"
          aria-live="polite"
        >
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
            Automatic SMS
          </div>
          <div className="mt-1 space-y-0.5 text-[11px] leading-4">
            {smsStatus.lines.map((line, index) => (
              <div
                key={`${line.text}-${index}`}
                className={statusToneClass(line.tone)}
                title={line.title || undefined}
              >
                {line.text}
              </div>
            ))}
          </div>
        </div>
      ) : smsStatusFailed ? (
        <div className="max-w-[190px] text-right text-[11px] leading-4 text-amber-200/70">
          <div>SMS status display unavailable</div>
          <div className="text-white/35">This does not mean SMS is disabled.</div>
        </div>
      ) : null}
    </div>
  );
}
