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
        "Your team receives the nine complete kits included in its original founding-team offer. Additional complete kits can be added for £20 each.";
      return;
    }

    if (
      text ===
      "Your nine-kit order has been submitted to SIXFL. It is now locked while we review it. The £90 contribution must be paid before the supplier order is placed."
    ) {
      element.textContent =
        "Your original nine-kit order has been submitted to SIXFL. It is now locked while we review and place it.";
      return;
    }

    if (
      text ===
      "The details below are read-only while SIXFL checks the order and arranges the £90 payment. Contact us if anything needs changing before production begins."
    ) {
      element.textContent =
        "The details below are read-only while SIXFL checks and places your original kit order. Contact us if anything needs changing before production begins.";
      return;
    }

    if (text === "Compulsory printing contribution") {
      element.textContent = "Original free kit allocation";
      return;
    }

    if (text === "£90 per team") {
      element.textContent = "Nine complete kits included";
      return;
    }

    if (
      text ===
      "This is £10 for each of the nine personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Please check every size, name and shirt number carefully before submitting. Additional complete kits are available for £20 each using the payment-link section above.";
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
        Your original nine-kit allocation is protected
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
        Your team receives the nine complete kits included in its original founding-team offer.
        Additional complete kits can be added for £20 each.
      </p>
    </section>
  );
}
