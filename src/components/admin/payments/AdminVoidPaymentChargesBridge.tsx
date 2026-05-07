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

const TEAM_VOID_BUTTON_SELECTOR = "[data-admin-void-payment-charge-button]";
const PLAYER_VOID_BUTTON_SELECTOR = "[data-admin-void-player-fee-button]";

function removeExistingButtons() {
  document.querySelectorAll(TEAM_VOID_BUTTON_SELECTOR).forEach((node) => node.remove());
  document.querySelectorAll(PLAYER_VOID_BUTTON_SELECTOR).forEach((node) => node.remove());
}

function normaliseText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function countActionsByLabels(element: Element, labels: string[]) {
  return Array.from(element.querySelectorAll("a,button")).filter((node) => {
    const text = normaliseText(node.textContent ?? "");
    return labels.some((label) => text.includes(label));
  }).length;
}

function getCardFromAction(action: Element, labels: string[]) {
  let current = action.parentElement;
  let best: Element | null = null;

  while (current && current.tagName !== "MAIN") {
    const actionCount = countActionsByLabels(current, labels);

    if (actionCount === 1) {
      best = current;
      current = current.parentElement;
      continue;
    }

    if (actionCount > 1) break;
    current = current.parentElement;
  }

  return best;
}

function findTeamChargeCards() {
  const labels = ["team chase sms", "chase by sms", "open communications"];
  const actions = Array.from(document.querySelectorAll("a,button")).filter((node) => {
    const text = normaliseText(node.textContent ?? "");
    return labels.some((label) => text.includes(label));
  });

  const cards = actions
    .map((action) => getCardFromAction(action, labels))
    .filter((card): card is Element => Boolean(card));

  return Array.from(new Set(cards));
}

function findMatchingTeamCharge(card: Element, items: VoidableCharge[]) {
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

function findTeamActionsContainer(card: Element) {
  const actions = Array.from(card.querySelectorAll("a,button")).filter((node) =>
    ["team chase sms", "chase by sms", "open communications"].some((label) =>
      normaliseText(node.textContent ?? "").includes(label),
    ),
  );

  const lastAction = actions.at(-1);
  return lastAction?.parentElement ?? null;
}

function createTeamVoidButton(input: {
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
          reason: "Voided by admin from payments screen.",
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

function injectTeamVoidButtons(input: {
  items: VoidableCharge[];
  onVoided: () => void;
}) {
  const usedChargeIds = new Set<string>();

  for (const card of findTeamChargeCards()) {
    if (card.querySelector(TEAM_VOID_BUTTON_SELECTOR)) continue;

    const item = findMatchingTeamCharge(card, input.items);
    if (!item || usedChargeIds.has(item.id)) continue;

    const actions = findTeamActionsContainer(card);
    if (!actions) continue;

    actions.appendChild(
      createTeamVoidButton({
        item,
        onVoided: input.onVoided,
      }),
    );
    usedChargeIds.add(item.id);
  }
}

function getPlayerFeeCardFromForm(form: HTMLFormElement) {
  const labels = ["chase player", "open team fees", "payment link"];
  let current = form.parentElement;
  let best: Element | null = null;

  while (current && current.tagName !== "MAIN") {
    const text = normaliseText(current.textContent ?? "");
    const chaseCount = countActionsByLabels(current, ["chase player"]);

    if (chaseCount === 1 && text.includes("open team fees")) {
      best = current;
      current = current.parentElement;
      continue;
    }

    if (countActionsByLabels(current, labels) > 3 || chaseCount > 1) break;
    current = current.parentElement;
  }

  return best;
}

function createPlayerVoidButton(input: {
  feeId: string;
  card: Element | null;
  onVoided: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.adminVoidPlayerFeeButton = input.feeId;
  button.className =
    "inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40";
  button.textContent = "Void charge";

  button.addEventListener("click", async () => {
    const cardText = normaliseText(input.card?.textContent ?? "");
    const confirmed = window.confirm(
      `Void this unpaid player charge?${cardText ? `\n\n${input.card?.textContent?.trim() ?? ""}` : ""}\n\nThis will remove it from the pending player fees list and cancel queued reminders.`,
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Voiding...";

    try {
      const response = await fetch("/api/admin/payments/void-player-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeId: input.feeId,
          reason: "Voided by admin from payments screen.",
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not void player charge.");
      }

      window.alert("Player charge voided and queued reminders cancelled.");
      input.onVoided();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not void player charge.");
      button.disabled = false;
      button.textContent = "Void charge";
    }
  });

  return button;
}

function injectPlayerVoidButtons(input: { onVoided: () => void }) {
  const forms = Array.from(document.querySelectorAll("form")).filter((form): form is HTMLFormElement =>
    Boolean(form.querySelector('input[name="feeId"]')) &&
    normaliseText(form.textContent ?? "").includes("chase player"),
  );

  for (const form of forms) {
    const feeIdInput = form.querySelector<HTMLInputElement>('input[name="feeId"]');
    const feeId = feeIdInput?.value?.trim();
    if (!feeId) continue;

    const actions = form.parentElement;
    if (!actions || actions.querySelector(PLAYER_VOID_BUTTON_SELECTOR)) continue;

    const card = getPlayerFeeCardFromForm(form);
    actions.appendChild(
      createPlayerVoidButton({
        feeId,
        card,
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
    let latestTeamItems: VoidableCharge[] = [];

    const refreshPage = () => {
      router.refresh();
      window.setTimeout(() => {
        removeExistingButtons();
        injectTeamVoidButtons({ items: latestTeamItems, onVoided: refreshPage });
        injectPlayerVoidButtons({ onVoided: refreshPage });
      }, 350);
    };

    async function loadTeamCharges() {
      try {
        const response = await fetch("/api/admin/payments/voidable-charges", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = (await response.json()) as VoidableChargesResponse;
        if (cancelled) return;

        latestTeamItems = data.items;
        injectTeamVoidButtons({ items: latestTeamItems, onVoided: refreshPage });
      } catch {
        // Do not block the payments page if this admin-only helper cannot load.
      }
    }

    function injectAllButtons() {
      injectTeamVoidButtons({ items: latestTeamItems, onVoided: refreshPage });
      injectPlayerVoidButtons({ onVoided: refreshPage });
    }

    loadTeamCharges();
    injectAllButtons();

    const timer = window.setTimeout(() => {
      loadTeamCharges();
      injectAllButtons();
    }, 600);

    const observer = new MutationObserver(() => {
      if (cancelled) return;
      injectAllButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer.disconnect();
      removeExistingButtons();
    };
  }, [pathname, router]);

  return null;
}
