// ========================================
// File: src/components/referee/RefereePreviewLinkFixer.tsx
// ========================================

"use client";

import { useEffect } from "react";

function getPreviewRefereeIdFromExitLink() {
  const exitLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
    /\/admin\/referees\/[^/]+\/referee-preview\/exit/.test(link.getAttribute("href") ?? ""),
  );

  const href = exitLink?.getAttribute("href") ?? "";
  return href.match(/\/admin\/referees\/([^/]+)\/referee-preview\/exit/)?.[1] ?? null;
}

function buildPreviewHref(refereeId: string, target: string) {
  return `/admin/referees/${encodeURIComponent(refereeId)}/referee-preview?to=${encodeURIComponent(target)}`;
}

export default function RefereePreviewLinkFixer() {
  useEffect(() => {
    const refereeId = getPreviewRefereeIdFromExitLink();
    if (!refereeId) return;

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='/referee']"));

    for (const link of links) {
      const href = link.getAttribute("href");
      if (!href) continue;
      if (href.startsWith("/referee") && !href.startsWith("/referee-preview")) {
        link.setAttribute("href", buildPreviewHref(refereeId, href));
      }
    }
  }, []);

  return null;
}
