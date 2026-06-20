// ========================================
// File: src/components/captain/PendingActivationReturnLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamId(pathname: string) {
  return pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/)?.[1] ?? null;
}

function getProspectId(href: string) {
  const match = href.match(/\/prospects\/([^/]+)\/communications(?:\?|#|$)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function addReturnButtons(pathname: string) {
  const teamId = getTeamId(pathname);
  if (!teamId) return;

  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('#pending-activation a[href*="/prospects/"][href*="/communications"]'),
  );

  for (const link of links) {
    const prospectId = getProspectId(link.getAttribute("href") ?? "");
    if (!prospectId) continue;
  }
}

export default function PendingActivationReturnLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/squad")) return;

    addReturnButtons(pathname);
  }, [pathname]);

  return null;
}
