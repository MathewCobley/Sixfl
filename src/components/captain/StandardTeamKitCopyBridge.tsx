"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type KitOfferType = "FREE_KIT" | "FOUNDING_PACKAGE" | "STANDARD";

type KitOfferResponse = {
  offerType?: KitOfferType;
  error?: string;
};

function getKitTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/kit(?:\/|$)/)?.[1] ?? null;
}

function normaliseText(value: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function applyStandardKitWording() {
  const root = document.querySelector<HTMLElement>(".captain-team-main");
  if (!root) return;

  const elements = root.querySelectorAll<HTMLElement>(
    "div, span, p, button, a",
  );

  elements.forEach((element) => {
    const text = normaliseText(element.textContent);

    if (text === "£70 Founding Team Kit Package") {
      element.textContent = "Standard team kit order";
      return;
    }

    if (
      text ===
      "The compulsory team contribution is £70 in total — £10 for each of the seven personalised shirts. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Complete kits are available for £20 each. The seven-kit order below costs £140 in total, with payment required before SIXFL places the supplier order.";
      return;
    }

    if (
      text ===
      "Your seven-kit order has been submitted to SIXFL. It is now locked while we review it. The £70 contribution must be paid before the supplier order is placed."
    ) {
      element.textContent =
        "Your seven-kit order has been submitted to SIXFL. It is now locked while we review it. The £140 payment must be completed before the supplier order is placed.";
      return;
    }

    if (
      text ===
      "The details below are read-only while SIXFL checks the order and arranges the £70 payment. Contact us if anything needs changing before production begins."
    ) {
      element.textContent =
        "The details below are read-only while SIXFL checks the order and arranges the £140 payment. Contact us if anything needs changing before production begins.";
      return;
    }

    if (text === "Compulsory printing contribution") {
      element.textContent = "Standard kit price";
      return;
    }

    if (text === "£70 per team") {
      element.textContent = "£140 for seven kits";
      return;
    }

    if (
      text ===
      "This is £10 for each of the seven personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Each complete kit costs £20. This order contains seven kits, so the total is £140. Submitting confirms that the captain has checked the design, sizes, names and numbers.";
      return;
    }

    if (text === "Submit £70 kit package") {
      element.textContent = "Submit seven-kit order";
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

export default function StandardTeamKitCopyBridge() {
  const pathname = usePathname();
  const teamId = getKitTeamId(pathname);
  const [offerType, setOfferType] = useState<KitOfferType | null>(null);

  useEffect(() => {
    if (!teamId) {
      setOfferType(null);
      return;
    }

    let cancelled = false;

    fetch(`/api/captain/team/${encodeURIComponent(teamId)}/legacy-kit-offer`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | KitOfferResponse
          | null;

        if (!cancelled) {
          setOfferType(response.ok ? payload?.offerType ?? null : null);
        }
      })
      .catch(() => {
        if (!cancelled) setOfferType(null);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  useEffect(() => {
    if (offerType !== "STANDARD") return;

    applyStandardKitWording();
    const observer = new MutationObserver(applyStandardKitWording);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), 2000);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [offerType, pathname]);

  if (offerType !== "STANDARD") return null;

  return (
    <section className="mx-auto mb-2 mt-4 w-[calc(100%-1.5rem)] max-w-[1400px] rounded-3xl border border-sky-400/25 bg-sky-500/[0.08] p-5 sm:w-[calc(100%-5rem)] sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200/75">
        Standard team kit order
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">
        Complete kits are £20 each
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
        Your team did not select a founding kit offer, but the full kit catalogue is still available. The seven-kit order form costs £140 in total.
      </p>
    </section>
  );
}
