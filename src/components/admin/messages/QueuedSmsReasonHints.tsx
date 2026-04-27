// ========================================
// File: src/components/admin/messages/QueuedSmsReasonHints.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const QUEUED_SMS_REASON_TEXT =
  "Queued because SMS sending is paused during quiet hours between 9pm and 9am UK time. It will send automatically after 9am.";

function getCommunicationCard(element: Element) {
  return (
    element.closest("[data-queued-sms-card]") ||
    element.closest(".space-y-3.px-6.py-5") ||
    element.closest(".space-y-4.rounded-2xl") ||
    element.closest(".rounded-2xl") ||
    element.closest(".rounded-\[1\.5rem\]") ||
    element.parentElement
  );
}

function isQueuedSmsText(value: string | null | undefined) {
  const text = value?.trim().toUpperCase() ?? "";

  return (
    text === "QUEUED" ||
    text === "SMS QUEUED" ||
    text.includes("SMS CHASE QUEUED") ||
    text.includes("ACTIVATION SMS QUEUED") ||
    text.includes("SMS QUEUED")
  );
}

export default function QueuedSmsReasonHints() {
  const pathname = usePathname();

  useEffect(() => {
    const applyHints = () => {
      const candidates = Array.from(
        document.querySelectorAll("span, div, p"),
      ).filter((element) => isQueuedSmsText(element.textContent));

      for (const candidate of candidates) {
        const card = getCommunicationCard(candidate);
        if (!card) continue;

        const cardText = card.textContent?.toUpperCase() ?? "";
        if (!cardText.includes("SMS") || !cardText.includes("QUEUED")) continue;
        if (cardText.includes("QUEUED BECAUSE SMS SENDING IS PAUSED")) continue;

        if (card.querySelector("[data-queued-sms-reason-hint]")) continue;

        const hint = document.createElement("div");
        hint.dataset.queuedSmsReasonHint = "true";
        hint.className =
          "mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100";
        hint.textContent = QUEUED_SMS_REASON_TEXT;

        card.appendChild(hint);
      }
    };

    applyHints();

    const observer = new MutationObserver(applyHints);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
