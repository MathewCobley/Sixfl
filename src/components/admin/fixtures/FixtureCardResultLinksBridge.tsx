// ========================================
// File: src/components/admin/fixtures/FixtureCardResultLinksBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getFixtureIdFromEditHref(href: string | null) {
  if (!href) return null;
  const match = href.match(/\/admin\/fixtures\/([^/?#]+)\/edit/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getReturnTo() {
  return `${window.location.pathname}${window.location.search}`;
}

function enhanceFixtureCards() {
  const editLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/admin/fixtures/"][href*="/edit"]'),
  );

  for (const editLink of editLinks) {
    const fixtureId = getFixtureIdFromEditHref(editLink.getAttribute("href"));
    const actionRow = editLink.closest("div");

    if (!fixtureId || !actionRow) continue;
    if (actionRow.querySelector(`[data-enter-result-for="${fixtureId}"]`)) continue;

    const resultLink = document.createElement("a");
    resultLink.dataset.enterResultFor = fixtureId;
    resultLink.href = `/admin/fixtures/${encodeURIComponent(fixtureId)}/result?returnTo=${encodeURIComponent(getReturnTo())}`;
    resultLink.textContent = "Enter result";
    resultLink.className = "inline-flex h-10 items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15";

    editLink.insertAdjacentElement("afterend", resultLink);
  }
}

export default function FixtureCardResultLinksBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/fixtures") return;

    const run = () => enhanceFixtureCards();
    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 800);
    const observer = new MutationObserver(run);

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
