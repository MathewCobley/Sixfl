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
