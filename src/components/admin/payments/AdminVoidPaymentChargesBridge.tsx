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
  amountPence: number;
  outstanding: string;
  outstandingPence: number;
  paidTotalPence: number;
  coveredPence: number;
  fixtureLabel: string | null;
};

type VoidableChargesResponse = {
  items: VoidableCharge[];
};

const TEAM_VOID_BUTTON_SELECTOR = "[data-admin-void-payment-charge-button]";
const TEAM_ADJUST_BUTTON_SELECTOR = "[data-admin-adjust-payment-charge-button]";
const PLAYER_VOID_BUTTON_SELECTOR = "[data-admin-void-player-fee-button]";

function removeExistingButtons() {
  document.querySelectorAll(TEAM_VOID_BUTTON_SELECTOR).forEach((node) => node.remove());
  document.querySelectorAll(TEAM_ADJUST_BUTTON_SELECTOR).forEach((node) => node.remove());
  document.querySelectorAll(PLAYER_VOID_BUTTON_SELECTOR).forEach((node) => node.remove());
}

function normaliseText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
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

function hasNativeTeamVoidAction(card: Element) {
  return Array.from(card.querySelectorAll("a,button")).some((node) => {
    if (node.matches(TEAM_VOID_BUTTON_SELECTOR)) return false;

    const text = normaliseText(node.textContent ?? "");
    return text.includes("void charge");
  });
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

function createTeamAdjustmentButton(input: {
  item: VoidableCharge;
  onAdjusted: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.adminAdjustPaymentChargeButton = input.item.id;
  button.disabled = input.item.outstandingPence <= 0;
  button.className =
    "inline-flex items-center rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40";
  button.textContent = "Reduce / waive";
  button.title = "Reduce this match fee or waive some/all of the outstanding balance";

  button.addEventListener("click", async () => {
    const defaultAmount = (input.item.outstandingPence / 100).toFixed(2);
    const amountText = window.prompt(
      `How much do you want to reduce/waive?\n\n${input.item.teamName}\n${input.item.title}\nCurrent charge: ${input.item.amount}\nOutstanding: ${input.item.outstanding}\n\nEnter amount in £:`,
      defaultAmount,
    );

    if (amountText === null) return;

    const amountPounds = Number(amountText.replace(/[£,\s]/g, ""));
    const waivePence = Math.round(amountPounds * 100);

    if (!Number.isFinite(amountPounds) || waivePence <= 0) {
      window.alert("Enter a valid amount greater than £0.00.");
      return;
    }

    if (waivePence > input.item.outstandingPence) {
      window.alert(`You can waive up to ${input.item.outstanding} on this charge.`);
      return;
    }

    const reason = window.prompt(
      "Reason for reducing/waiving this fee (this is kept in the charge audit note):",
      "Goodwill adjustment",
    );

    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Please enter a reason for the adjustment.");
      return;
    }

    const newAmountPence = input.item.amountPence - waivePence;
    const newOutstandingPence = input.item.outstandingPence - waivePence;
    const confirmed = window.confirm(
      `Confirm fee adjustment?\n\n${input.item.teamName}\n${input.item.title}\n\nReduce/waive: ${formatMoney(waivePence)}\nNew charge total: ${formatMoney(newAmountPence)}\nRemaining outstanding: ${formatMoney(newOutstandingPence)}\n\nReason: ${reason.trim()}\n\nNo fake payment will be recorded. The charge itself will be reduced and the adjustment will be noted.`,
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Adjusting...";

    try {
      const response = await fetch("/api/admin/payments/adjust-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId: input.item.id,
          waivePence,
          reason: reason.trim(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            newAmountPence?: number;
            outstandingPence?: number;
          }
        | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not adjust charge.");
      }

      window.alert(
        `Fee adjusted successfully.\n\nNew charge: ${formatMoney(data?.newAmountPence ?? newAmountPence)}\nOutstanding: ${formatMoney(data?.outstandingPence ?? newOutstandingPence)}`,
      );
      input.onAdjusted();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not adjust charge.");
      button.disabled = input.item.outstandingPence <= 0;
      button.textContent = "Reduce / waive";
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

    // The admin payments page now renders its own Void charge link.
    // Avoid injecting a second client-side button into the same charge card.
    if (hasNativeTeamVoidAction(card)) continue;

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

function injectTeamAdjustmentButtons(input: {
  items: VoidableCharge[];
  onAdjusted: () => void;
}) {
  const usedChargeIds = new Set<string>();

  for (const card of findTeamChargeCards()) {
    if (card.querySelector(TEAM_ADJUST_BUTTON_SELECTOR)) continue;

    const item = findMatchingTeamCharge(card, input.items);
    if (!item || item.outstandingPence <= 0 || usedChargeIds.has(item.id)) continue;

    const actions = findTeamActionsContainer(card);
    if (!actions) continue;

    actions.appendChild(
      createTeamAdjustmentButton({
        item,
        onAdjusted: input.onAdjusted,
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

async function autoVoidCancelledFixtureCharges() {
  const response = await fetch("/api/admin/payments/void-cancelled-fixture-charges", {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) return 0;

  const payload = (await response.json().catch(() => null)) as { voided?: number } | null;
  return payload?.voided ?? 0;
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
        if (cancelled) return;
        removeExistingButtons();
        void loadTeamCharges();
        injectTeamVoidButtons({ items: latestTeamItems, onVoided: refreshPage });
        injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });
        injectPlayerVoidButtons({ onVoided: refreshPage });
      }, 350);
    };

    async function cleanCancelledCharges() {
      try {
        const voided = await autoVoidCancelledFixtureCharges();
        if (!cancelled && voided > 0) {
          refreshPage();
        }
      } catch {
        // Do not block the payments page if this cleanup cannot run.
      }
    }

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
        injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });
      } catch {
        // Do not block the payments page if this admin-only helper cannot load.
      }
    }

    function injectAllButtons() {
      injectTeamVoidButtons({ items: latestTeamItems, onVoided: refreshPage });
      injectTeamAdjustmentButtons({ items: latestTeamItems, onAdjusted: refreshPage });
      injectPlayerVoidButtons({ onVoided: refreshPage });
    }

    void cleanCancelledCharges();
    void loadTeamCharges();
    injectAllButtons();

    const timer = window.setTimeout(() => {
      void cleanCancelledCharges();
      void loadTeamCharges();
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
