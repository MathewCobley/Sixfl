// ========================================
// File: src/components/admin/night-board/NightBoardWarningsPositionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function findHeading(texts: string[]) {
  return Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find((heading) =>
    texts.includes(heading.textContent?.trim() ?? ""),
  );
}

function getDirectChildOf(container: HTMLElement, element: HTMLElement) {
  let current: HTMLElement | null = element;

  while (current?.parentElement && current.parentElement !== container) {
    current = current.parentElement;
  }

  return current?.parentElement === container ? current : null;
}

function moveWarningsNearTop() {
  const warningsHeading = findHeading(["Warnings", "Warnings and potential issues"]);
  const pitchBoardHeading = findHeading(["Pitch board"]);
  if (!warningsHeading || !pitchBoardHeading) return;

  const container = warningsHeading.closest<HTMLElement>(".space-y-8");
  if (!container || !container.contains(pitchBoardHeading)) return;

  const warningsCard = getDirectChildOf(container, warningsHeading);
  const pitchBoardCard = getDirectChildOf(container, pitchBoardHeading);
  if (!warningsCard || !pitchBoardCard || warningsCard === pitchBoardCard) return;

  if (pitchBoardCard.previousElementSibling === warningsCard) return;
  container.insertBefore(warningsCard, pitchBoardCard);
}

export default function NightBoardWarningsPositionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/night-board") return;

    moveWarningsNearTop();

    const observer = new MutationObserver(() => moveWarningsNearTop());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
