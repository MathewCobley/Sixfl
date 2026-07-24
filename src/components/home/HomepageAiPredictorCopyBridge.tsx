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

    if (!predictorSection) return;

    const walker = document.createTreeWalker(
      predictorSection,
      NodeFilter.SHOW_TEXT,
    );

    let currentNode = walker.nextNode();
    while (currentNode) {
      const currentText = currentNode.textContent?.trim() ?? "";
      const replacement = COPY_REPLACEMENTS.get(currentText);

      if (replacement) {
        currentNode.textContent = currentNode.textContent?.replace(
          currentText,
          replacement,
        ) ?? replacement;
      }

      currentNode = walker.nextNode();
    }
  }, [pathname]);

  return null;
}
