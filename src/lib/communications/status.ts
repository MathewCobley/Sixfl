// ========================================
// File: src/lib/communications/status.ts
// ========================================

import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { formatDateTimeInLondon } from "@/lib/datetime/london";

export type CommunicationStatusTone = "emerald" | "amber" | "sky" | "red" | "neutral";

export type CommunicationStatusInfo = {
  label: string;
  detail: string | null;
  tone: CommunicationStatusTone;
};

function formatUkDateTime(value: Date) {
  return formatDateTimeInLondon(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getQueuedSmsReason(input: {
  scheduledFor: Date | null | undefined;
  now?: Date;
}) {
  const scheduledFor = input.scheduledFor ?? null;
  const now = input.now ?? new Date();

  if (scheduledFor && scheduledFor.getTime() > now.getTime()) {
    return `Queued because SMS sending is paused during quiet hours between 9pm and 9am UK time. It will send automatically ${formatUkDateTime(scheduledFor)}.`;
  }

  return "Queued and waiting for the SMS worker to send it.";
}

export function getCommunicationStatusInfo(input: {
  channel: NotificationChannel;
  status: NotificationDispatchStatus | string;
  scheduledFor?: Date | null;
  failureReason?: string | null;
}): CommunicationStatusInfo {
  const status = String(input.status).trim().toUpperCase();

  if (status === "QUEUED") {
    return {
      label: "Queued",
      detail:
        input.channel === NotificationChannel.SMS
          ? getQueuedSmsReason({ scheduledFor: input.scheduledFor })
          : "Queued and waiting to be sent.",
      tone: "amber",
    };
  }

  if (status === "PROCESSING") {
    return {
      label: "Processing",
      detail: "This message is currently being processed by the sender.",
      tone: "sky",
    };
  }

  if (status === "SENT") {
    return {
      label: "Sent",
      detail: null,
      tone: "emerald",
    };
  }

  if (status === "FAILED") {
    return {
      label: "Failed",
      detail: input.failureReason || "Sending failed.",
      tone: "red",
    };
  }

  if (status === "CANCELLED") {
    return {
      label: "Cancelled",
      detail: input.failureReason || "This queued message was cancelled before it was sent.",
      tone: "red",
    };
  }

  if (status === "SKIPPED") {
    return {
      label: "Not sent",
      detail: input.failureReason || "Message rules prevented this message from being sent.",
      tone: "red",
    };
  }

  return {
    label: status ? status.charAt(0) + status.slice(1).toLowerCase() : "Recorded",
    detail: null,
    tone: "neutral",
  };
}

export function getCommunicationStatusToneClass(tone: CommunicationStatusTone) {
  switch (tone) {
    case "emerald":
      return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    case "amber":
      return "border-amber-400/20 bg-amber-500/10 text-amber-100";
    case "sky":
      return "border-sky-400/20 bg-sky-500/10 text-sky-100";
    case "red":
      return "border-red-400/20 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-white/70";
  }
}
