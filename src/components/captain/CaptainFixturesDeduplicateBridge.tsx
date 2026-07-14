"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function normalise(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findMatchListSection() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
  const heading = headings.find((item) => normalise(item.textContent) === "match list");
  if (!heading) return null;

  let current: HTMLElement | null = heading;
  while (current && current.parentElement) {
    current = current.parentElement;
    if (current.querySelector(".divide-y")) return current;
  }

  return null;
}

function findFixtureRowFromSelectedBadge(badge: HTMLElement) {
  let current: HTMLElement | null = badge;
  while (current && current.parentElement) {
    current = current.parentElement;
    const className = current.getAttribute("class") ?? "";
    if (className.includes("px-6") && className.includes("py-5")) return current;
  }

  return null;
}

function deduplicateSelectedFixture() {
  const section = findMatchListSection();
  if (!section) return;

  const heading = Array.from(section.querySelectorAll<HTMLElement>("h2")).find(
    (item) => normalise(item.textContent) === "match list",
  );
  if (heading) heading.textContent = "Other upcoming fixtures";

  const list = section.querySelector<HTMLElement>(".divide-y");
  if (!list) return;

  const selectedBadges = Array.from(list.querySelectorAll<HTMLElement>("span")).filter(
    (item) => normalise(item.textContent) === "selected",
  );

  for (const badge of selectedBadges) {
    const row = findFixtureRowFromSelectedBadge(badge);
    if (row) {
      row.dataset.sixflHiddenSelectedFixture = "true";
      row.style.display = "none";
    }
  }

  const visibleRows = Array.from(list.children).filter((child) => {
    if (!(child instanceof HTMLElement)) return false;
    if (child.dataset.sixflHiddenSelectedFixture === "true") return false;
    return child.offsetParent !== null || child.style.display !== "none";
  });

  let emptyMessage = list.querySelector<HTMLElement>("[data-sixfl-other-fixtures-empty]");

  if (visibleRows.length === 0) {
    if (!emptyMessage) {
      emptyMessage = document.createElement("div");
      emptyMessage.dataset.sixflOtherFixturesEmpty = "true";
      emptyMessage.className = "px-6 py-10 text-sm text-white/55";
      emptyMessage.textContent = "No other published upcoming fixtures yet.";
      list.appendChild(emptyMessage);
    }
  } else {
    emptyMessage?.remove();
  }
}

export default function CaptainFixturesDeduplicateBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!/^\/captain\/team\/[^/]+\/fixtures(?:\/)?$/.test(pathname)) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) deduplicateSelectedFixture();
    };

    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
