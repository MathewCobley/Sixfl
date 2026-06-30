// ========================================
// File: src/components/referee/RefereeNightFixtureDateBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getNightDateLabel() {
  return Array.from(document.querySelectorAll<HTMLElement>("span, p, div"))
    .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .find((text) => /\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/.test(text)) ?? null;
}

function addDateToFixtureCards() {
  const nightDateLabel = getNightDateLabel();
  if (!nightDateLabel) return;

  const fixtureMetaRows = Array.from(document.querySelectorAll<HTMLElement>("article div")).filter((element) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.includes("Match ") && text.includes("Week ") && !element.querySelector("[data-referee-fixture-date='1']");
  });

  for (const row of fixtureMetaRows) {
    const dateSpan = document.createElement("span");
    dateSpan.dataset.refereeFixtureDate = "1";
    dateSpan.textContent = nightDateLabel;

    const separator = document.createElement("span");
    separator.dataset.refereeFixtureDate = "1";
    separator.textContent = "•";

    const matchPill = Array.from(row.children).find((child) => child.textContent?.includes("Match "));

    if (matchPill?.nextSibling) {
      row.insertBefore(separator, matchPill.nextSibling);
      row.insertBefore(dateSpan, separator.nextSibling);
    } else {
      row.appendChild(separator);
      row.appendChild(dateSpan);
    }
  }
}

export default function RefereeNightFixtureDateBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/referee/night/")) return;

    const frame = window.requestAnimationFrame(addDateToFixtureCards);
    const observer = new MutationObserver(addDateToFixtureCards);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
