// ========================================
// File: src/components/captain/TeamAutoPayCopyBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function replaceExactText(from: string, to: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    if (node.textContent?.trim() === from) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    textNode.textContent = to;
  }
}

function replaceContainingText(from: string, to: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    if (node.textContent?.includes(from)) {
      textNodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  for (const textNode of textNodes) {
    textNode.textContent = to;
  }
}

function ensureAutoPayMessage(state: string | null) {
  document.querySelectorAll("[data-team-autopay-message]").forEach((node) => node.remove());

  if (!state) return;

  const message = document.createElement("div");
  message.dataset.teamAutopayMessage = "true";
  message.className = "rounded-2xl border px-5 py-4 text-sm";

  if (state === "success") {
    message.className += " border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
    message.textContent = "Saved card setup complete. SIXFL will only use it for one-off matchday team fees on the actual fixture day.";
  } else if (state === "cancelled") {
    message.className += " border-amber-400/20 bg-amber-500/10 text-amber-100";
    message.textContent = "Saved card setup was cancelled. No automatic matchday card payment has been enabled.";
  } else if (state === "missing_team") {
    message.className += " border-red-400/20 bg-red-500/10 text-red-100";
    message.textContent = "Saved card setup could not start because this team could not be found.";
  } else {
    return;
  }

  const main = document.querySelector("main") ?? document.body;
  const firstChild = main.firstElementChild;
  if (firstChild) {
    firstChild.insertAdjacentElement("afterbegin", message);
  } else {
    main.appendChild(message);
  }
}

function updatePaymentCopy(state: string | null) {
  replaceExactText("Automatic payments", "Saved card payments");
  replaceExactText("Recurring team payments", "Saved card matchday payments");
  replaceExactText("Set up automatic payments", "Set up saved card");
  replaceExactText("Replace automatic payment", "Replace saved card");
  replaceExactText("Manage in Stripe", "Manage saved card");
  replaceContainingText(
    "Set up a recurring Stripe payment for your team.",
    "Save a team card securely with Stripe. SIXFL will only create a one-off payment on the actual matchday for a scheduled fixture.",
  );
  replaceContainingText(
    "Successful renewal payments will be recorded automatically in the SIXFL payment history.",
    "No subscription will be created. If a fixture is postponed or cancelled, the saved card will not be charged for that fixture.",
  );
  ensureAutoPayMessage(state);
}

export default function TeamAutoPayCopyBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!/^\/captain\/team\/[^/]+\/payments\/?$/.test(pathname)) return;

    const state = searchParams.get("autopay");
    updatePaymentCopy(state);

    const observer = new MutationObserver(() => updatePaymentCopy(state));
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname, searchParams]);

  return null;
}
