// ========================================
// File: src/components/home/HomepageAiPredictorCopyBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const COPY_REPLACEMENTS = new Map([
  ["Sample prediction", "Match prediction"],
  [
    "SIXFL AI Predictor: Six Offenders edge the sample prediction after stronger recent scoring form, but Crescent United carry enough threat to make this a competitive fixture.",
    "Six Offenders are slight favourites after stronger recent scoring form. Crescent United still carry enough attacking threat to keep this fixture competitive.",
  ],
  [
    "Example only. Live predictions update from actual SIXFL fixture and results data.",
    "Live predictions are calculated from completed SIXFL results, recent form, goals scored and goals conceded.",
  ],
]);

function addPredictorLogo(predictorSection: HTMLElement) {
  if (predictorSection.dataset.predictorLogoApplied === "true") return;

  const heading = Array.from(predictorSection.querySelectorAll("h2")).find(
    (element) =>
      element.textContent?.trim() ===
      "Match predictions, powered by SIXFL AI Predictor.",
  );

  const currentBadge = heading?.previousElementSibling;
  if (!(currentBadge instanceof HTMLElement)) return;

  const logoWrap = document.createElement("div");
  logoWrap.className =
    "relative -mt-2 h-32 w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/70 shadow-[0_18px_55px_rgba(0,0,0,0.35)] sm:h-40";

  const logo = document.createElement("img");
  logo.src = "/logos/sixfl-ai-predictor.png";
  logo.alt = "SIXFL AI Predictor";
  logo.className = "h-full w-full object-cover object-[center_58%]";
  logo.loading = "eager";

  logoWrap.appendChild(logo);
  currentBadge.replaceWith(logoWrap);

  const repeatedBadge = Array.from(
    predictorSection.querySelectorAll<HTMLElement>("span"),
  ).find(
    (element) => element.textContent?.trim() === "SIXFL AI Predictor",
  );
  repeatedBadge?.remove();

  predictorSection.dataset.predictorLogoApplied = "true";
}

export default function HomepageAiPredictorCopyBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const main = document.querySelector("main");
    if (!main) return;

    const predictorSection = Array.from(main.querySelectorAll("section")).find(
      (section) =>
        section.textContent?.includes(
          "Match predictions, powered by SIXFL AI Predictor.",
        ),
    );

    if (!(predictorSection instanceof HTMLElement)) return;

    addPredictorLogo(predictorSection);

    const walker = document.createTreeWalker(
      predictorSection,
      NodeFilter.SHOW_TEXT,
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      const currentText = currentNode.textContent?.trim() ?? "";
      const replacement = COPY_REPLACEMENTS.get(currentText);

      if (replacement) {
        currentNode.textContent =
          currentNode.textContent?.replace(currentText, replacement) ?? replacement;
      }

      currentNode = walker.nextNode();
    }
  }, [pathname]);

  return null;
}
