// ========================================
// File: src/components/captain/SquadPaymentAmountSync.tsx
// ========================================

"use client";

import { useEffect } from "react";

function normaliseAmount(value: string) {
  const numeric = Number(String(value).replace(/[£,\s]/g, ""));

  if (!Number.isFinite(numeric) || numeric < 0) return null;

  return numeric.toFixed(2);
}

function getDefaultInput() {
  return document.querySelector<HTMLInputElement>(
    'form[action] input[name="amount"], input#amount[name="amount"]',
  );
}

function getAmountInputs() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[name^="amount_member_"], input[name^="amount_prospect_"]',
    ),
  );
}

function getPaymentIdentity(input: HTMLInputElement) {
  const match = input.name.match(/^amount_(member|prospect)_(.+)$/);
  if (!match) return null;
  return { type: match[1] as "member" | "prospect", id: match[2] };
}

function getPlayerCheckbox(input: HTMLInputElement) {
  const identity = getPaymentIdentity(input);
  if (!identity) return null;

  return document.querySelector<HTMLInputElement>(
    `input[type="checkbox"][name="player"][value="${identity.type}:${identity.id}"]`,
  );
}

function getPaymentCard(input: HTMLInputElement) {
  return input.closest("div.rounded-xl") as HTMLElement | null;
}

function getExistingStatusText(card: HTMLElement | null) {
  if (!card) return "";

  return Array.from(card.querySelectorAll("span"))
    .map((span) => span.textContent?.trim() ?? "")
    .find((text) => ["Paid", "Waived", "Unpaid", "Cancelled"].includes(text)) ?? "";
}

function getCollectionControlName(input: HTMLInputElement) {
  const identity = getPaymentIdentity(input);
  return identity ? `collection_${identity.type}_${identity.id}` : null;
}

function isNoLinkPaidBySixfl(input: HTMLInputElement) {
  const amount = Number(normaliseAmount(input.value) ?? "0");
  const card = getPaymentCard(input);
  return getExistingStatusText(card) === "Waived" && amount > 0;
}

function updateStatusBadgeText(input: HTMLInputElement) {
  const card = getPaymentCard(input);
  if (!card) return;

  const amount = Number(normaliseAmount(input.value) ?? "0");
  for (const span of Array.from(card.querySelectorAll("span"))) {
    const text = span.textContent?.trim();
    if (text === "Waived" && amount > 0) {
      span.textContent = "Paid SIXFL via DD";
    }
  }
}

function getSelectedCollectionMethod(input: HTMLInputElement) {
  const controlName = getCollectionControlName(input);
  if (!controlName) return "link";

  const checked = document.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${controlName}"]:checked`,
  );

  return checked?.value ?? "link";
}

function ensureCollectionMethodControls(input: HTMLInputElement, defaultInput: HTMLInputElement) {
  if (input.disabled) return;

  const identity = getPaymentIdentity(input);
  const controlName = getCollectionControlName(input);
  const card = getPaymentCard(input);

  if (!identity || !controlName || !card) return;
  if (card.querySelector(`[data-collection-method-for="${controlName}"]`)) return;

  const checkbox = getPlayerCheckbox(input);
  const existingStatus = getExistingStatusText(card);
  const amount = Number(normaliseAmount(input.value) ?? "0");
  const currentMethod = isNoLinkPaidBySixfl(input)
    ? "captain_paid"
    : existingStatus === "Waived" || amount === 0
      ? "waived"
      : "link";

  const wrapper = document.createElement("div");
  wrapper.dataset.collectionMethodFor = controlName;
  wrapper.className = "mt-3 rounded-xl border border-white/10 bg-black/20 p-3";

  const title = document.createElement("div");
  title.className = "text-xs font-semibold uppercase tracking-[0.14em] text-white/45";
  title.textContent = "Collection method";
  wrapper.appendChild(title);

  const options = [
    {
      value: "link",
      label: "Send SIXFL payment link/email",
      help: "Use this when the player still needs to pay online.",
    },
    {
      value: "captain_paid",
      label: "Paid SIXFL via DD",
      help: "No player link or email. This share is treated as already covered with SIXFL.",
    },
    {
      value: "waived",
      label: "Waived / no charge",
      help: "No payment expected from this player.",
    },
  ];

  for (const option of options) {
    const label = document.createElement("label");
    label.className = "mt-2 flex cursor-pointer items-start gap-2 text-xs text-white/70";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = controlName;
    radio.value = option.value;
    radio.defaultChecked = option.value === currentMethod;
    radio.className = "mt-0.5";

    const copy = document.createElement("span");
    copy.innerHTML = `<span class="font-medium text-white/85">${option.label}</span><span class="mt-0.5 block text-white/45">${option.help}</span>`;

    label.appendChild(radio);
    label.appendChild(copy);
    wrapper.appendChild(label);

    radio.addEventListener("change", () => {
      if (!radio.checked) return;

      if (checkbox) checkbox.checked = true;

      if (radio.value === "waived") {
        input.value = "0.00";
        input.dataset.customAmount = "true";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (radio.value === "link" && Number(normaliseAmount(input.value) ?? "0") === 0) {
        input.value = normaliseAmount(defaultInput.value) ?? "0.00";
        input.dataset.customAmount = "false";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  const amountRow = input.closest("div.mt-3") ?? input.parentElement;
  amountRow?.insertAdjacentElement("afterend", wrapper);
  updateStatusBadgeText(input);
}

export default function SquadPaymentAmountSync() {
  useEffect(() => {
    const defaultInput = getDefaultInput();

    if (!defaultInput) return;

    const initialiseInputs = () => {
      const currentDefault = normaliseAmount(defaultInput.value) ?? "0.00";

      for (const input of getAmountInputs()) {
        const currentValue = normaliseAmount(input.value);
        input.dataset.lastSyncedDefault = currentDefault;
        input.dataset.customAmount = currentValue === currentDefault ? "false" : "true";
        ensureCollectionMethodControls(input, defaultInput);
        updateStatusBadgeText(input);
      }
    };

    const handlePlayerAmountInput = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const currentDefault = normaliseAmount(defaultInput.value);
      const currentValue = normaliseAmount(input.value);

      if (!currentDefault || !currentValue) {
        input.dataset.customAmount = "true";
        return;
      }

      input.dataset.customAmount = currentValue === currentDefault ? "false" : "true";
    };

    const handleDefaultInput = () => {
      const nextDefault = normaliseAmount(defaultInput.value);
      if (!nextDefault) return;

      for (const input of getAmountInputs()) {
        if (input.disabled) continue;
        if (getSelectedCollectionMethod(input) === "waived") continue;

        const currentValue = normaliseAmount(input.value);
        const previousDefault = input.dataset.lastSyncedDefault;
        const isCustomAmount = input.dataset.customAmount === "true";
        const stillOnPreviousDefault = Boolean(
          previousDefault && currentValue && currentValue === previousDefault,
        );

        if (!isCustomAmount || stillOnPreviousDefault || !input.value.trim()) {
          input.value = nextDefault;
          input.dataset.customAmount = "false";
          input.dataset.lastSyncedDefault = nextDefault;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };

    initialiseInputs();

    defaultInput.addEventListener("input", handleDefaultInput);

    for (const input of getAmountInputs()) {
      input.addEventListener("input", handlePlayerAmountInput);
    }

    return () => {
      defaultInput.removeEventListener("input", handleDefaultInput);

      for (const input of getAmountInputs()) {
        input.removeEventListener("input", handlePlayerAmountInput);
      }
    };
  }, []);

  return null;
}
