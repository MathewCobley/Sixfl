// ========================================
// File: src/components/player/PlayerPreviewLinkPersistence.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

function addPreviewMembershipToHref(input: {
  href: string;
  teamId: string;
  previewMembershipId: string;
}) {
  const url = new URL(input.href, window.location.origin);
  const teamPrefix = `/player/team/${input.teamId}`;

  if (url.origin !== window.location.origin) return input.href;
  if (!url.pathname.startsWith(teamPrefix)) return input.href;

  url.searchParams.set("previewMembershipId", input.previewMembershipId);

  return `${url.pathname}${url.search}${url.hash}`;
}

export default function PlayerPreviewLinkPersistence({
  teamId,
}: {
  teamId: string;
}) {
  const searchParams = useSearchParams();
  const previewMembershipId = searchParams.get("previewMembershipId")?.trim() || null;

  useEffect(() => {
    if (!previewMembershipId) return;

    const playerLinkSelector = `a[href^="/player/team/${teamId}"]`;

    function updatePreviewLinks() {
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>(playerLinkSelector))) {
        const href = link.getAttribute("href");
        if (!href) continue;

        link.setAttribute(
          "href",
          addPreviewMembershipToHref({ href, teamId, previewMembershipId }),
        );
      }

      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="/api/auth/signout"]'))) {
        link.setAttribute("href", `/admin/teams/${teamId}`);
        link.textContent = "Exit preview";
      }
    }

    updatePreviewLinks();

    const observer = new MutationObserver(updatePreviewLinks);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [previewMembershipId, teamId]);

  return null;
}
