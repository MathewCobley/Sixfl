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

function findChargeCard(item: VoidableCharge) {
  const cards = Array.from(document.querySelectorAll("div"));
  const titleNeedle = normaliseText(`${item.teamName} · ${item.title}`);
  const altTitleNeedle = normaliseText(`${item.teamName} - ${item.title}`);

  return (
    cards.find((card) => {
      const text = normaliseText(card.textContent ?? "");

      return (
        text.includes(titleNeedle) ||
        text.includes(altTitleNeedle) ||
        (text.includes(normaliseText(item.teamName)) &&
          text.includes(normaliseText(item.title)) &&
          (!item.fixtureLabel || text.includes(normaliseText(item.fixtureLabel))))
      );
    }) ?? null
  );
}

function findActionsContainer(card: Element) {
  const links = Array.from(card.querySelectorAll("a,button"));
  const action = links.find((node) =>
    ["open communications", "chase by sms"].some((label) =>
      normaliseText(node.textContent ?? "").includes(label),
    ),
  );

  return action?.parentElement ?? null;
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
  for (const item of input.items) {
    const card = findChargeCard(item);
    if (!card) continue;

    if (card.querySelector(`[data-admin-void-payment-charge-button="${item.id}"]`)) {
      continue;
    }

    const actions = findActionsContainer(card);
    if (!actions) continue;

    actions.appendChild(
      createVoidButton({
        item,
        onVoided: input.onVoided,
      }),
    );
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
