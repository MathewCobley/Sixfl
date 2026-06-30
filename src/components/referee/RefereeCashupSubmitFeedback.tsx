// ========================================
// File: src/components/referee/RefereeCashupSubmitFeedback.tsx
// ========================================

"use client";

import { useEffect } from "react";

export default function RefereeCashupSubmitFeedback() {
  useEffect(() => {
    const forms = Array.from(
      document.querySelectorAll<HTMLFormElement>("form[data-referee-cashup-submit='1']"),
    );

    const cleanups = forms.map((form) => {
      const onSubmit = () => {
        const button = form.querySelector<HTMLButtonElement>("button[type='submit']");
        if (!button) return;

        button.disabled = true;
        button.textContent = "Submitting cashup...";
        button.className =
          "inline-flex h-12 w-full cursor-not-allowed items-center justify-center rounded-2xl bg-emerald-300/70 px-6 text-sm font-semibold text-black opacity-80 sm:w-auto";
      };

      form.addEventListener("submit", onSubmit);
      return () => form.removeEventListener("submit", onSubmit);
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
