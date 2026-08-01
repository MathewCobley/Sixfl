"use client";

import { useEffect } from "react";

type LegacyFreeKitOfferCopyBridgeProps = {
  active: boolean;
};

function normalise(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function applyLegacyCopy() {
  const root = document.querySelector<HTMLElement>(
    '[data-captain-kit-page="true"]',
  );
  if (!root) return;

  const elements = Array.from(
    root.querySelectorAll<HTMLElement>("div, span, p, h2, button, a"),
  );

  for (const element of elements) {
    const text = normalise(element.textContent);

    if (text === "£90 Founding Team Kit Package") {
      element.textContent = "Original free kit offer";
      continue;
    }

    if (
      text ===
      "The compulsory team contribution is £90 in total — £10 for each of the nine personalised shirts. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Your team selected the original founding-team free kit offer before it changed. SIXFL will honour that offer for this nine-kit order, so the new £90 contribution does not apply.";
      element.classList.remove("text-amber-100/80");
      element.classList.add("text-emerald-100/80");
      continue;
    }

    if (
      text.startsWith("Your nine-kit order has been submitted to SIXFL") &&
      text.includes("£90 contribution")
    ) {
      element.textContent =
        "Your original free-kit order has been submitted to SIXFL. It is now locked while we review it. No £90 contribution applies to this order.";
      continue;
    }

    if (text.includes("arranges the £90 payment")) {
      element.textContent =
        "The details below are read-only while SIXFL checks and places your original free-kit order. Contact us if anything needs changing before production begins.";
      continue;
    }

    if (text === "Compulsory printing contribution") {
      element.textContent = "Original free kit offer honoured";
      continue;
    }

    if (text === "£90 per team") {
      element.textContent = "No £90 contribution";
      continue;
    }

    if (
      text.startsWith("This is £10 for each of the nine personalised shirts")
    ) {
      element.textContent =
        "Your team selected the free kit offer before it changed. The new compulsory printing contribution does not apply to this original nine-kit order. Please still check every size, name and shirt number carefully before submitting.";
      continue;
    }

    if (text === "Submit £90 kit package") {
      element.textContent = "Submit free kit order";
      continue;
    }

    if (
      element.tagName === "A" &&
      (text === "Read package terms" || text === "Read the Kit Package Terms")
    ) {
      element.style.display = "none";
    }
  }
}

export default function LegacyFreeKitOfferCopyBridge({
  active,
}: LegacyFreeKitOfferCopyBridgeProps) {
  useEffect(() => {
    if (!active) return;

    applyLegacyCopy();

    const observer = new MutationObserver(() => applyLegacyCopy());
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = window.setTimeout(() => observer.disconnect(), 2500);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [active]);

  if (!active) return null;

  return (
    <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/75">
        Original offer protected
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">
        Your free kit offer is being honoured
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
        Your team selected the founding-team free kit offer before the website changed.
        The new £90 contribution does not apply to this original nine-kit order.
      </p>
    </section>
  );
}
