// ========================================
// File: src/components/admin/payments/AdminVoidPaymentChargesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type VoidableCharge = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  status: string;
  amount: string;
  outstanding: string;
  outstandingPence: number;
  paidTotalPence: number;
  fixtureLabel: string | null;
};

type VoidableChargesResponse = {
  items: VoidableCharge[];
};

function removeExistingButtons() {
  document
    .querySelectorAll("[data-admin-void-payment-charge-button]")
    .forEach((node) => node.remove());
}

function normaliseText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function countOpenCommunicationActions(element: Element) {
  return Array.from(element.querySelectorAll("a,button")).filter((node) =>
    normaliseText(node.textContent ?? "").includes("open communications"),
  ).length;
}

function getActualChargeCardFromAction(action: Element) {
  let current = action.parentElement;
  let best: Element | null = null;

  while (current && current.tagName !== "MAIN") {
    const actionCount = countOpenCommunicationActions(current);

    if (actionCount === 1) {
      best = current;
      current = current.parentElement;
      continue;
    }

    break;
  }

  return best;
}

function findChargeCards() {
  const actions = Array.from(document.querySelectorAll("a,button")).filter((node) =>
    normaliseText(node.textContent ?? "").includes("open communications"),
  );

  const cards = actions
    .map(getActualChargeCardFromAction)
    .filter((card): card is Element => Boolean(card));

  return Array.from(new Set(cards));
}

function findMatchingItem(card: Element, items: VoidableCharge[]) {
  const text = normaliseText(card.textContent ?? "");

  return items.find((item) => {
    const teamName = normaliseText(item.teamName);
    const title = normaliseText(item.title);
    const fixtureLabel = item.fixtureLabel ? normaliseText(item.fixtureLabel) : null;

    return (
      text.includes(teamName) &&
      text.includes(title) &&
      (!fixtureLabel || text.includes(fixtureLabel))
    );
  });
}

function findActionsContainer(card: Element) {
  const actions = Array.from(card.querySelectorAll("a,button")).filter((node) =>
    ["open communications", "chase by sms"].some((label) =>
      normaliseText(node.textContent ?? "").includes(label),
    ),
  );

  const lastAction = actions.at(-1);
  return lastAction?.parentElement ?? null;
}

function createVoidButton(input: {
  item: VoidableCharge;
  onVoided: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.adminVoidPaymentChargeButton = input.item.id;
  button.disabled = input.item.paidTotalPence > 0 || input.item.outstandingPence <= 0;
  button.className =
    "inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40";
  button.textContent = input.item.paidTotalPence > 0 ? "Paid - cannot void" : "Void charge";

  button.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `Void this unpaid team charge?\n\n${input.item.teamName}\n${input.item.title}\n${input.item.outstanding} outstanding\n\nThis will cancel queued payment reminders.`,
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Voiding...";

    try {
      const response = await fetch("/api/admin/payments/void-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId: input.item.id,
          reason: "Game conceded / fixture not played",
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not void charge.");
      }

      window.alert("Team charge voided and queued payment reminders cancelled.");
      input.onVoided();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not void charge.");
      button.disabled = input.item.paidTotalPence > 0 || input.item.outstandingPence <= 0;
      button.textContent = input.item.paidTotalPence > 0 ? "Paid - cannot void" : "Void charge";
    }
  });

  return button;
}

function injectVoidButtons(input: {
  items: VoidableCharge[];
  onVoided: () => void;
}) {
  const usedChargeIds = new Set<string>();

  for (const card of findChargeCards()) {
    if (card.querySelector("[data-admin-void-payment-charge-button]")) continue;

    const item = findMatchingItem(card, input.items);
    if (!item || usedChargeIds.has(item.id)) continue;

    const actions = findActionsContainer(card);
    if (!actions) continue;

    actions.appendChild(
      createVoidButton({
        item,
        onVoided: input.onVoided,
      }),
    );
    usedChargeIds.add(item.id);
  }
}

export default function AdminVoidPaymentChargesBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    removeExistingButtons();

    if (pathname !== "/admin/payments") return;

    let cancelled = false;

    async function loadCharges() {
      try {
        removeExistingButtons();

        const response = await fetch("/api/admin/payments/voidable-charges", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = (await response.json()) as VoidableChargesResponse;
        if (cancelled) return;

        injectVoidButtons({
          items: data.items,
          onVoided: () => router.refresh(),
        });
      } catch {
        // Do not block the payments page if this admin-only helper cannot load.
      }
    }

    loadCharges();

    const timer = window.setTimeout(loadCharges, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      removeExistingButtons();
    };
  }, [pathname, router]);

  return null;
}
