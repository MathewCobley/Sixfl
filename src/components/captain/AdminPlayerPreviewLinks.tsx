// ========================================
// File: src/components/captain/AdminPlayerPreviewLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const injectedLinkClassName =
  "inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl px-4 py-2.5 text-center text-sm font-medium transition";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function getPlayerCommunicationsHref(input: { teamId: string; membershipId: string }) {
  return `/admin/teams/${input.teamId}/players/${input.membershipId}/communications`;
}

function normaliseActionLayout(actionsContainer: HTMLElement) {
  actionsContainer.className =
    "grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:w-[22rem] xl:max-w-[22rem] xl:shrink-0";
  actionsContainer.style.display = "grid";
  actionsContainer.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  actionsContainer.style.gap = "0.5rem";
  actionsContainer.style.width = "min(22rem, 100%)";
  actionsContainer.style.maxWidth = "22rem";
  actionsContainer.style.alignItems = "stretch";

  for (const form of Array.from(actionsContainer.querySelectorAll("form"))) {
    const hasRoleSelect = Boolean(form.querySelector('[name="role"]'));

    if (hasRoleSelect) {
      form.className = "grid w-full min-w-0 grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto]";
      form.style.gridColumn = "1 / -1";
      form.style.display = "grid";
      form.style.gridTemplateColumns = "minmax(0, 1fr) auto";
      form.style.gap = "0.5rem";

      const selectWrapper = form.querySelector("div");
      if (selectWrapper instanceof HTMLElement) {
        selectWrapper.className = "min-w-0";
      }
    } else {
      form.className = "w-full";
      form.style.gridColumn = "auto";
    }
  }

  for (const control of Array.from(
    actionsContainer.querySelectorAll<HTMLElement>("a, button"),
  )) {
    control.classList.add("w-full", "justify-center", "text-center");
    control.classList.remove("sm:w-auto", "shrink-0");
    control.style.width = "100%";
    control.style.minHeight = "2.75rem";
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

    const observer = new MutationObserver(() => addPreviewLinks(pathname));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
