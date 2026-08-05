"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)(?:\/|$)/)?.[1] ?? "";
}

export default function CaptainResultsNavBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    let stopped = false;
    let attempts = 0;
    let timer: number | null = null;

    const apply = () => {
      if (stopped) return;
      attempts += 1;

      const matchReportsLink = document.querySelector<HTMLAnchorElement>(
        `a[href="/captain/team/${CSS.escape(teamId)}/results"]`,
      );

      if (!matchReportsLink) {
        if (attempts < 20) timer = window.setTimeout(apply, 150);
        return;
      }

      matchReportsLink.textContent = "Match reports";
      matchReportsLink.setAttribute("aria-label", "Match reports");

      const resultsHref = `/captain/team/${teamId}/results-history`;
      if (!document.querySelector(`a[href="${resultsHref}"]`)) {
        const resultsLink = matchReportsLink.cloneNode(true) as HTMLAnchorElement;
        resultsLink.href = resultsHref;
        resultsLink.textContent = "Results";
        resultsLink.setAttribute("aria-label", "Results");
        matchReportsLink.parentElement?.insertBefore(resultsLink, matchReportsLink);
      }
    };

    timer = window.setTimeout(apply, 0);
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
