"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import StandardKitPaymentPanel from "@/components/captain/StandardKitPaymentPanel";

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
      element.textContent = "Team kit order";
      return;
    }

    if (
      text ===
      "The compulsory team contribution is £70 in total — £10 for each of the seven personalised shirts. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Complete kits cost £20 each. Send a payment link to each squad member who wants one. A personalisation box appears after that kit has been paid for.";
      return;
    }

    if (
      text ===
      "Your seven-kit order has been submitted to SIXFL. It is now locked while we review it. The £70 contribution must be paid before the supplier order is placed."
    ) {
      element.textContent =
        "Your paid kit order has been submitted to SIXFL and is now locked while we review it.";
      return;
    }

    if (
      text ===
      "The details below are read-only while SIXFL checks the order and arranges the £70 payment. Contact us if anything needs changing before production begins."
    ) {
      element.textContent =
        "The details below are read-only while SIXFL checks and places the paid kit order. Contact us if anything needs changing before production begins.";
      return;
    }

    if (text === "Compulsory printing contribution") {
      element.textContent = "Kit price";
      return;
    }

    if (text === "£70 per team") {
      element.textContent = "£20 per complete kit";
      return;
    }

    if (
      text ===
      "This is £10 for each of the seven personalised shirts. Submitting confirms that the captain has checked the design, sizes, names and numbers. Payment is required before SIXFL places the supplier order."
    ) {
      element.textContent =
        "Only paid kits are included in this order. Please check every design, size, name and shirt number before submitting.";
      return;
    }

    if (text === "Submit £70 kit package") {
      element.textContent = "Submit paid kit order";
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

  if (offerType !== "STANDARD" || !teamId) return null;

  return <StandardKitPaymentPanel teamId={teamId} />;
}
