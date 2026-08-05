"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function normalise(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export default function ReopenedNightAccessBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/referee") return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | null = null;

    const apply = () => {
      if (cancelled) return;
      attempts += 1;

      const scheduleLinks = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href^="/referee/night/"]'),
      );

      const reopenedBadges = Array.from(document.querySelectorAll<HTMLElement>("span")).filter(
        (element) => normalise(element.textContent).toLowerCase() === "reopened",
      );

      for (const badge of reopenedBadges) {
        const row = badge.closest<HTMLElement>(".grid");
        if (!row || row.querySelector('[data-reopened-night-access="true"]')) continue;

        const rowText = normalise(row.textContent);
        const matchingLink = scheduleLinks.find((link) => {
          const card = link.closest<HTMLElement>("article");
          if (!card) return false;
          const cardText = normalise(card.textContent);

          const dateText = Array.from(row.querySelectorAll<HTMLElement>("span"))
            .map((item) => normalise(item.textContent))
            .find((text) => /\d{2}\s+[A-Za-z]+\s+\d{4}/.test(text));

          return Boolean(dateText && cardText.includes(dateText)) &&
            Array.from(row.querySelectorAll<HTMLElement>("div"))
              .map((item) => normalise(item.textContent))
              .some((text) => text.length > 8 && cardText.includes(text));
        });

        if (!matchingLink) continue;

        const button = document.createElement("a");
        button.href = matchingLink.getAttribute("href") || matchingLink.href;
        button.textContent = "Open reopened night";
        button.dataset.reopenedNightAccess = "true";
        button.className =
          "inline-flex items-center rounded-xl border border-violet-400/30 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/20";

        const actions = row.lastElementChild;
        actions?.appendChild(button);
      }

      if (attempts < 20 && reopenedBadges.some((badge) => {
        const row = badge.closest<HTMLElement>(".grid");
        return row && !row.querySelector('[data-reopened-night-access="true"]');
      })) {
        timer = window.setTimeout(apply, 150);
      }
    };

    timer = window.setTimeout(apply, 0);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document
        .querySelectorAll<HTMLElement>('[data-reopened-night-access="true"]')
        .forEach((element) => element.remove());
    };
  }, [pathname]);

  return null;
}
