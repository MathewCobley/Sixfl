// ========================================
// File: src/components/admin/messages/QueuedSmsReasonHints.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const QUEUED_SMS_STATUS_TEXTS = new Set([
  "QUEUED",
  "SMS QUEUED",
  "SMS CHASE QUEUED",
  "ACTIVATION SMS QUEUED",
]);

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

function normaliseText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toUpperCase() ?? "";
}

function isQueuedSmsStatusText(value: string | null | undefined) {
  return QUEUED_SMS_STATUS_TEXTS.has(normaliseText(value));
}

function getExistingStatusDetail(card: Element) {
  const details = Array.from(card.querySelectorAll("span, div, p"))
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);

  return details.find((text) =>
    /queued because|waiting for the sms worker|will send automatically/i.test(text),
  );
}

export default function QueuedSmsReasonHints() {
  const pathname = usePathname();

  useEffect(() => {
    const applyHints = () => {
      const candidates = Array.from(
        document.querySelectorAll("span, div, p"),
      ).filter((element) => isQueuedSmsStatusText(element.textContent));

      for (const candidate of candidates) {
        const card = getCommunicationCard(candidate);
        if (!card) continue;

        const cardText = normaliseText(card.textContent);
        if (!cardText.includes("SMS") || !cardText.includes("QUEUED")) continue;

        const existingHint = card.querySelector("[data-queued-sms-reason-hint]");
        const existingDetail = getExistingStatusDetail(card);

        if (!existingDetail) {
          existingHint?.remove();
          continue;
        }

        if (existingHint) {
          if (existingHint.textContent !== existingDetail) {
            existingHint.textContent = existingDetail;
          }
          continue;
        }

        const hint = document.createElement("div");
        hint.dataset.queuedSmsReasonHint = "true";
        hint.className =
          "mt-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100";
        hint.textContent = existingDetail;

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
