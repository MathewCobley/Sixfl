"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type LegacyOfferResponse = {
  legacyOffer?: boolean;
};

function getKitTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/kit(?:\/|$)/)?.[1] ?? null;
}

function normaliseText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function applyLegacyWording() {
  const root = document.querySelector<HTMLElement>(".captain-team-main");
  if (!root) return;

  const elements = root.querySelectorAll<HTMLElement>(
    "div, span, p, button, a",
  );

  elements.forEach((element) => {
    const text = normaliseText(element.textContent);

    if (text === "£90 Founding Team Kit Package") {
      element.textContent = "Original free kit offer";
      return;
    }

    if (
      text ===
      "The compulsory team contribution is £90 in total — £10 for each of the nine personalised shirts. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Your team selected the original founding-team free kit offer before it changed. SIXFL will honour that offer for this nine-kit order, so the new £90 contribution does not apply.";
      return;
    }

    if (
      text ===
      "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed."
    ) {
      element.textContent =
        "Your original free-kit order has been submitted to SIXFL. It is now locked while we review it. No £90 contribution applies to this order.";
      return;
    }

    if (
      text ===
      "The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins."
    ) {
      element.textContent =
        "The details below are read-only while SIXFL checks and places your original free-kit order. Contact us if anything needs changing before production begins.";
      return;
    }

    if (text === "Compulsory printing contribution") {
      element.textContent = "Original free kit offer honoured";
      return;
    }

    if (text === "£90 per team") {
      element.textContent = "No £90 contribution";
      return;
    }

    if (
      text ===
      "This is £10 for each of the nine personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Your team selected the free kit offer before it changed. The new compulsory printing contribution does not apply to this original nine-kit order. Please still check every size, name and shirt number carefully before submitting.";
      return;
    }

    if (text === "Submit £90 kit package") {
      element.textContent = "Submit free kit order";
      return;
    }

    if (
      element.tagName === "A" &&
      (text === "Read package terms" || text === "Read the Kit Package Terms")
    ) {
      element.hidden = true;
    }
  });
}

export default function LegacyFreeKitOfferCopyBridge() {
  const pathname = usePathname();
  const [legacyOffer, setLegacyOffer] = useState(false);

  useEffect(() => {
    const teamId = getKitTeamId(pathname);
    if (!teamId) {
      setLegacyOffer(false);
      return;
    }

    let cancelled = false;

    fetch(`/api/captain/team/${encodeURIComponent(teamId)}/legacy-kit-offer`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | LegacyOfferResponse
          | null;

        if (!cancelled) {
          setLegacyOffer(Boolean(response.ok && payload?.legacyOffer));
        }
      })
      .catch(() => {
        if (!cancelled) setLegacyOffer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!legacyOffer) return;

    applyLegacyWording();
    const timer = window.setTimeout(applyLegacyWording, 250);

    return () => window.clearTimeout(timer);
  }, [legacyOffer, pathname]);

  if (!legacyOffer) return null;

  return (
    <section className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:w-[calc(100%-5rem)] sm:p-6">
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
