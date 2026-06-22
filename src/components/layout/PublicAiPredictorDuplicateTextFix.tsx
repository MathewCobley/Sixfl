// ========================================
// File: src/components/layout/PublicAiPredictorDuplicateTextFix.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function normaliseText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isAiPredictorBlock(element: HTMLElement) {
  const text = normaliseText(element.textContent ?? "");
  const className = element.getAttribute("class") ?? "";

  return (
    className.includes("rounded-3xl") &&
    text.includes("sixfl ai predictor") &&
    text.includes("predicted result")
  );
}

function hasPreviewText(block: HTMLElement) {
  return Array.from(block.querySelectorAll<HTMLElement>("div, p")).some((element) => {
    const text = normaliseText(element.textContent ?? "");
    const className = element.getAttribute("class") ?? "";

    return (
      className.includes("text-white/60") &&
      text.length > 30 &&
      !text.includes("sixfl ai predictor") &&
      !text.includes("predicted result")
    );
  });
}

function isTechnicalExplanation(element: HTMLElement) {
  const text = normaliseText(element.textContent ?? "");

  return (
    text.includes("based on completed league results") ||
    text.includes("no completed league results yet") ||
    text.includes("points per game") ||
    text.includes("goal difference") ||
    text.includes("head-to-head")
  );
}

function removeDuplicatePredictorText() {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>("div, section"))
    .filter(isAiPredictorBlock);

  for (const block of blocks) {
    if (block.dataset.aiDuplicateTextFixed === "true") continue;
    if (!hasPreviewText(block)) continue;

    const explanation = Array.from(block.querySelectorAll<HTMLElement>("p"))
      .reverse()
      .find(isTechnicalExplanation);

    explanation?.remove();
    block.dataset.aiDuplicateTextFixed = "true";
  }
}

export default function PublicAiPredictorDuplicateTextFix() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/leagues/")) return;

    removeDuplicatePredictorText();

    const observer = new MutationObserver(removeDuplicatePredictorText);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
