// ========================================
// File: src/components/admin/payments/AdminPlayerFeePaymentLabelsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function isPlayerFeePaymentCard(card: Element) {
  const text = card.textContent ?? "";

  return (
    text.includes("Unlinked payment") &&
    text.includes("Stripe") &&
    text.includes("£6.00")
  );
}

function relabelPlayerFeePayments() {
  const recentPaymentsHeadings = Array.from(document.querySelectorAll("h2")).filter(
    (heading) => heading.textContent?.trim() === "Recent payments",
  );

  for (const heading of recentPaymentsHeadings) {
    const section = heading.closest("section");
    if (!section) continue;

    const paymentCards = Array.from(section.querySelectorAll("div.rounded-2xl"));

    for (const card of paymentCards) {
      if (!isPlayerFeePaymentCard(card)) continue;

      const label = Array.from(card.querySelectorAll("div")).find((element) =>
        element.textContent?.trim() === "Unlinked payment · Stripe",
      );

      if (label) {
        label.textContent = "Player match fee · Stripe";
      }
    }
  }
}

export default function AdminPlayerFeePaymentLabelsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/payments") return;

    relabelPlayerFeePayments();

    const observer = new MutationObserver(relabelPlayerFeePayments);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
