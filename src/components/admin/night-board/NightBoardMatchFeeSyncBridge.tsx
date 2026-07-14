// ========================================
// File: src/components/admin/night-board/NightBoardMatchFeeSyncBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function isNightBoardForm(form: HTMLFormElement) {
  return Boolean(
    form.querySelector<HTMLInputElement>('input[name="fixtureId"]') &&
      form.querySelector<HTMLInputElement>('input[name="kickoffTime"]') &&
      form.querySelector<HTMLSelectElement>('select[name="status"]'),
  );
}

function getReturnTo(formData: FormData) {
  const explicit = String(formData.get("returnTo") ?? "").trim();
  if (explicit.startsWith("/admin/night-board")) return explicit;
  return `${window.location.pathname}${window.location.search}`;
}

export default function NightBoardMatchFeeSyncBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || !isNightBoardForm(form)) return;

      event.preventDefault();

      const formData = new FormData(form);
      const returnTo = getReturnTo(formData);
      const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])'));

      buttons.forEach((button) => {
        button.disabled = true;
        button.dataset.originalText = button.textContent ?? "";
        button.textContent = "Saving…";
      });

      void fetch("/api/admin/night-board/update-match", {
        method: "POST",
        body: formData,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => null)) as { returnTo?: string; error?: string } | null;

          if (!response.ok) {
            throw new Error(payload?.error || "The match could not be saved.");
          }

          window.location.assign(payload?.returnTo || returnTo);
        })
        .catch((error) => {
          console.error("Night Board save failed", error);
          buttons.forEach((button) => {
            button.disabled = false;
            button.textContent = button.dataset.originalText || "Save match";
          });
          alert(error instanceof Error ? error.message : "The match could not be saved.");
        });
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [pathname]);

  return null;
}
