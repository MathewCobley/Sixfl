// ========================================
// File: src/components/captain/AdminLoginEmailDuplicateFix.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getActionContainers() {
  return Array.from(document.querySelectorAll<HTMLElement>("main form input[name='membershipId']"))
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement)
    .map((form) => form.parentElement)
    .filter((element): element is HTMLElement => element instanceof HTMLElement);
}

function normaliseText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function cleanupDuplicateLoginEmailButtons() {
  for (const actionsContainer of getActionContainers()) {
    const loginButtons = Array.from(actionsContainer.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => normaliseText(button.textContent).includes("send login email"));

    if (loginButtons.length <= 1) continue;

    const nativeButtons = loginButtons.filter((button) => !button.dataset.dashboardLoginEmail);
    const injectedButtons = loginButtons.filter((button) => Boolean(button.dataset.dashboardLoginEmail));

    if (nativeButtons.length > 0) {
      for (const button of injectedButtons) {
        button.remove();
      }
      continue;
    }

    for (const button of loginButtons.slice(1)) {
      button.remove();
    }
  }
}

export default function AdminLoginEmailDuplicateFix() {
  const pathname = usePathname();

  useEffect(() => {
    let frame = window.requestAnimationFrame(cleanupDuplicateLoginEmailButtons);
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(cleanupDuplicateLoginEmailButtons);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
