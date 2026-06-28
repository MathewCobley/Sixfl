// ========================================
// File: src/components/referee/RefereeDashboardCopyBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function improveRefereeDashboardCopy() {
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((item) =>
    item.textContent?.trim().toLowerCase().endsWith("referee dashboard"),
  );

  if (!heading) return;

  const refereeName = heading.textContent?.replace(/referee dashboard$/i, "").trim() || "Referee";
  const intro = heading.parentElement?.querySelector<HTMLParagraphElement>("p.mt-2");

  heading.textContent = `${refereeName}'s match night dashboard`;

  if (intro) {
    intro.textContent = "Your referee nights, availability, match sheets, cashup and payments are all shown here.";
  }
}

export default function RefereeDashboardCopyBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/referee") return;

    const frame = window.requestAnimationFrame(improveRefereeDashboardCopy);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
