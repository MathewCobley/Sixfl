// ========================================
// File: src/components/captain/AdminPlayerPreviewLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getPlayerCommunicationsHref(input: { teamId: string; membershipId: string }) {
  return `/admin/teams/${input.teamId}/players/${input.membershipId}/communications`;
}

function normaliseExistingCommsLink(input: {
  actionsContainer: HTMLElement;
  teamId: string;
  membershipId: string;
}) {
  const { actionsContainer, teamId, membershipId } = input;
  const playerCommsHref = getPlayerCommunicationsHref({ teamId, membershipId });

  const commsLinks = Array.from(actionsContainer.querySelectorAll<HTMLAnchorElement>("a"))
    .filter((link) => {
      const href = link.getAttribute("href") ?? "";
      return (
        href === `/admin/teams/${teamId}/communications` ||
        /^\/admin\/teams\/[^/]+\/prospects\/[^/]+\/communications$/.test(href)
      );
    });

  for (const link of commsLinks) {
    link.href = playerCommsHref;
    link.textContent = "Player comms";
    link.dataset.adminPlayerCommsLink = membershipId;
    link.className =
      "inline-flex items-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15";
  }
}

function addPreviewLinks(pathname: string) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const roleForms = Array.from(
    document.querySelectorAll<HTMLFormElement>('main form input[name="membershipId"]'),
  )
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => form instanceof HTMLFormElement)
    .filter((form) => Boolean(form.querySelector('input[name="teamid"]')));

  for (const form of roleForms) {
    const membershipId = form
      .querySelector<HTMLInputElement>('input[name="membershipId"]')
      ?.value.trim();

    if (!membershipId) continue;

    const actionsContainer = form.parentElement;
    if (!(actionsContainer instanceof HTMLElement)) continue;

    normaliseExistingCommsLink({ actionsContainer, teamId, membershipId });

    const existingLink = actionsContainer.querySelector(
      `a[data-admin-player-preview-link="${membershipId}"]`,
    );
    if (existingLink) continue;

    const previewLink = document.createElement("a");
    previewLink.href = `/admin/teams/${teamId}/players/${membershipId}/preview`;
    previewLink.textContent = "Player preview";
    previewLink.dataset.adminPlayerPreviewLink = membershipId;
    previewLink.className =
      "inline-flex items-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:bg-violet-500/15";

    actionsContainer.insertBefore(previewLink, form.nextSibling);
  }
}

export default function AdminPlayerPreviewLinks() {
  const pathname = usePathname();

  useEffect(() => {
    addPreviewLinks(pathname);
  }, [pathname]);

  return null;
}
