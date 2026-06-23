// ========================================
// File: src/components/admin/teams/AdminSendPlayerLoginButton.tsx
// ========================================

"use client";

import { useState } from "react";

type SendState = "idle" | "sending" | "sent" | "error";

function getButtonText(state: SendState) {
  switch (state) {
    case "sending":
      return "Sending login email…";
    case "sent":
      return "Login email sent";
    case "error":
      return "Try login email again";
    default:
      return "Send login email";
  }
}

export default function AdminSendPlayerLoginButton({
  teamId,
  membershipId,
}: {
  teamId: string;
  membershipId: string;
}) {
  const [state, setState] = useState<SendState>("idle");

  async function sendLoginEmail() {
    setState("sending");

    try {
      const response = await fetch(`/api/captain/team/${teamId}/send-player-login-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Login email could not be sent.");
      }

      setState("sent");
    } catch (error) {
      setState("error");
      window.alert(error instanceof Error ? error.message : "Login email could not be sent.");
    }
  }

  return (
    <button
      type="button"
      disabled={state === "sending" || state === "sent"}
      onClick={sendLoginEmail}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-center text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {getButtonText(state)}
    </button>
  );
}
