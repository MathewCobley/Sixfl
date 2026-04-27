// ========================================
// File: src/components/admin/communications/CommunicationStatusBadge.tsx
// ========================================

import type { ReactNode } from "react";

type CommunicationStatusBadgeProps = {
  status: string | null | undefined;
  className?: string;
};

function getNormalisedStatus(value: string | null | undefined) {
  const raw = value?.trim() || "RECORDED";
  const upper = raw.toUpperCase();

  if (upper.startsWith("SKIPPED")) {
    const reason = raw.includes(":")
      ? raw.split(":").slice(1).join(":").trim()
      : "Message rules prevented this from being sent.";

    return {
      key: "NOT_SENT",
      label: `NOT SENT: ${reason}`,
      explanation: `This message was not sent. ${reason}`,
    };
  }

  if (upper.startsWith("FAILED")) {
    const reason = raw.includes(":")
      ? raw.split(":").slice(1).join(":").trim()
      : "Sending failed.";

    return {
      key: "FAILED",
      label: `FAILED: ${reason}`,
      explanation: `Sending failed. ${reason}`,
    };
  }

  if (upper.startsWith("CANCELLED")) {
    const reason = raw.includes(":")
      ? raw.split(":").slice(1).join(":").trim()
      : "Cancelled before sending.";

    return {
      key: "CANCELLED",
      label: "CANCELLED",
      explanation: reason,
    };
  }

  if (upper.startsWith("QUEUED")) {
    return {
      key: "QUEUED",
      label: "QUEUED",
      explanation: "This message is queued and has not been sent yet.",
    };
  }

  if (upper.startsWith("PROCESSING")) {
    return {
      key: "PROCESSING",
      label: "PROCESSING",
      explanation: "This message is being processed.",
    };
  }

  if (upper.startsWith("SENT")) {
    return {
      key: "SENT",
      label: "SENT",
      explanation: "This message was sent.",
    };
  }

  if (upper.startsWith("DELIVERED")) {
    return {
      key: "SENT",
      label: "DELIVERED",
      explanation: "This message was delivered.",
    };
  }

  return {
    key: "RECORDED",
    label: raw,
    explanation: null,
  };
}

function getToneClass(key: string) {
  if (key === "FAILED" || key === "NOT_SENT" || key === "CANCELLED") {
    return "border-red-400/20 bg-red-500/10 text-red-100";
  }

  if (key === "QUEUED" || key === "PROCESSING") {
    return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  }

  if (key === "SENT") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }

  return "border-white/10 bg-white/[0.04] text-white/60";
}

export function getCommunicationStatusView(status: string | null | undefined) {
  const normalised = getNormalisedStatus(status);

  return {
    ...normalised,
    toneClassName: getToneClass(normalised.key),
  };
}

export function CommunicationStatusExplanation({
  status,
  children,
}: {
  status: string | null | undefined;
  children?: ReactNode;
}) {
  const view = getCommunicationStatusView(status);

  if (!view.explanation && !children) return null;

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${view.toneClassName}`}>
      {children ?? view.explanation}
    </div>
  );
}

export default function CommunicationStatusBadge({
  status,
  className = "",
}: CommunicationStatusBadgeProps) {
  const view = getCommunicationStatusView(status);

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${view.toneClassName} ${className}`}
    >
      {view.label}
    </span>
  );
}
