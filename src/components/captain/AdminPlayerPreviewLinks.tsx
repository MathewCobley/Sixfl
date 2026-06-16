// ========================================
// File: src/components/captain/AdminPlayerPreviewLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const injectedLinkClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-medium transition sm:w-auto";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getPlayerCommunicationsHref(input: { teamId: string; membershipId: string }) {
  return `/admin/teams/${input.teamId}/players/${input.membershipId}/communications`;
}

function normaliseActionLayout(actionsContainer: HTMLElement) {
  actionsContainer.className =
    "flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:max-w-[38rem] xl:justify-end";

  for (const form of Array.from(actionsContainer.querySelectorAll("form"))) {
    const hasRoleSelect = Boolean(form.querySelector('[name="role"]'));

    if (hasRoleSelect) {
      form.className =
        "flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center";

      const selectWrapper = form.querySelector("div");
      if (selectWrapper instanceof HTMLElement) {
        selectWrapper.className = "w-full min-w-0 sm:w-[220px]";
      }
    } else {
      form.className = "w-full sm:w-auto";
    }
  }

  for (const control of Array.from(
    actionsContainer.querySelectorAll<HTMLElement>("a, button"),
  )) {
    control.classList.add("w-full", "justify-center", "text-center", "sm:w-auto");
    control.classList.remove("shrink-0");
  }
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
    link.className = `${injectedLinkClassName} border border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15`;
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

    normaliseActionLayout(actionsContainer);
    normaliseExistingCommsLink({ actionsContainer, teamId, membershipId });

    const existingLink = actionsContainer.querySelector(
      `a[data-admin-player-preview-link="${membershipId}"]`,
    );

    if (!existingLink) {
      const previewLink = document.createElement("a");
      previewLink.href = `/admin/teams/${teamId}/players/${membershipId}/preview`;
      previewLink.textContent = "Player preview";
      previewLink.dataset.adminPlayerPreviewLink = membershipId;
      previewLink.className = `${injectedLinkClassName} border border-violet-400/30 bg-violet-500/10 text-violet-100 hover:bg-violet-500/15`;

      actionsContainer.insertBefore(previewLink, form.nextSibling);
    }

    normaliseActionLayout(actionsContainer);
  }
}

export default function AdminPlayerPreviewLinks() {
  const pathname = usePathname();

  useEffect(() => {
    addPreviewLinks(pathname);
  }, [pathname]);

  return null;
}
