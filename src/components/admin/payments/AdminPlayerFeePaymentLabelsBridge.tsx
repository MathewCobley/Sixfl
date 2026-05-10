// ========================================
// File: src/components/admin/payments/AdminPlayerFeePaymentLabelsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type PlayerFeePaymentLabel = {
  transactionId: string;
  teamName: string;
  amountPence: number;
  paidAt: string;
  title: string;
  subtitle: string;
};

type LabelsPayload = {
  labels?: PlayerFeePaymentLabel[];
};

function isUnlabelledPlayerFeePaymentCard(card: Element) {
  const text = card.textContent ?? "";

  return (
    text.includes("Unlinked payment") &&
    text.includes("Stripe") &&
    text.includes("£6.00")
  );
}

function getRecentPaymentsCards() {
  const recentPaymentsHeadings = Array.from(document.querySelectorAll("h2")).filter(
    (heading) => heading.textContent?.trim() === "Recent payments",
  );

  return recentPaymentsHeadings.flatMap((heading) => {
    const section = heading.closest("section");
    if (!section) return [];

    return Array.from(section.querySelectorAll("div.rounded-2xl")).filter(
      isUnlabelledPlayerFeePaymentCard,
    );
  });
}

function relabelPlayerFeePayments(labels: PlayerFeePaymentLabel[]) {
  const cards = getRecentPaymentsCards();

  cards.forEach((card, index) => {
    const label = labels[index];
    if (!label) return;

    const subtitleElement = Array.from(card.querySelectorAll("div")).find(
      (element) => element.textContent?.trim() === "Unlinked payment · Stripe",
    );

    if (!subtitleElement) return;

    const titleElement = subtitleElement.previousElementSibling;

    if (titleElement) {
      titleElement.textContent = label.title;
    }

    subtitleElement.textContent = label.subtitle;
  });
}

function relabelPlayerFeeReminderBadges() {
  const playerFeeHeadings = Array.from(document.querySelectorAll("h2")).filter(
    (heading) => heading.textContent?.includes("pending from players"),
  );

  for (const heading of playerFeeHeadings) {
    const section = heading.closest("section");
    if (!section) continue;

    const badgeElements = Array.from(section.querySelectorAll("div, span")).filter(
      (element) => element.textContent?.trim().startsWith("Last chased:"),
    );

    for (const badge of badgeElements) {
      const text = badge.textContent?.trim() ?? "";

      if (text === "Last chased: not chased yet") {
        badge.textContent = "Payment request: see history · Chase: not sent yet";
        badge.classList.remove("text-white/55");
        badge.classList.add("text-amber-100");
        continue;
      }

      if (text.startsWith("Last chased:")) {
        badge.textContent = text.replace("Last chased:", "Last request/chase:");
      }
    }
  }
}

async function loadPlayerFeePaymentLabels() {
  const response = await fetch("/api/admin/payments/player-fee-labels", {
    cache: "no-store",
  });

  if (!response.ok) return [];

  const payload = (await response.json().catch(() => null)) as LabelsPayload | null;
  return payload?.labels ?? [];
}

export default function AdminPlayerFeePaymentLabelsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/payments") return;

    let cancelled = false;
    let labels: PlayerFeePaymentLabel[] = [];

    void loadPlayerFeePaymentLabels().then((loadedLabels) => {
      if (cancelled) return;
      labels = loadedLabels;
      relabelPlayerFeePayments(labels);
      relabelPlayerFeeReminderBadges();
    });

    relabelPlayerFeeReminderBadges();

    const observer = new MutationObserver(() => {
      if (labels.length > 0) {
        relabelPlayerFeePayments(labels);
      }

      relabelPlayerFeeReminderBadges();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
