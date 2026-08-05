"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function FixturePaymentWordingBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!/^\/captain\/team\/[^/]+\/payments(?:\/|$)/.test(pathname)) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | null = null;

    const apply = () => {
      if (cancelled) return;
      attempts += 1;

      const candidates = Array.from(document.querySelectorAll<HTMLElement>("div, p, span"));
      const title = candidates.find(
        (element) => element.textContent?.trim() === "Player links still open",
      );

      if (title) {
        title.textContent = "Unpaid player links included above";
        const box = title.closest<HTMLElement>("div.rounded-xl, div.rounded-2xl") ?? title.parentElement;
        const paragraphs = box ? Array.from(box.querySelectorAll<HTMLElement>("p, div")) : [];
        const explanation = paragraphs.find((element) =>
          element.textContent?.includes("This is not outstanding on the fixture"),
        );
        if (explanation) {
          explanation.textContent =
            "These links have not been paid yet, so this amount is already part of the fixture balance above. Each payment will reduce the outstanding balance. Only payments collected after the fixture is fully covered become team credit.";
        }
        return;
      }

      if (attempts < 20) timer = window.setTimeout(apply, 150);
    };

    timer = window.setTimeout(apply, 0);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
