// ========================================
// File: src/components/captain/ManagedSquadEditLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/);
  return match?.[1] ?? null;
}

function addManagedSquadEditLinks(pathname: string) {
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

    const existingLink = actionsContainer.querySelector(
      `a[data-managed-squad-edit-link="${membershipId}"]`,
    );
    if (existingLink) continue;

    const editLink = document.createElement("a");
    editLink.href = `/captain/team/${teamId}/squad/${membershipId}/edit`;
    editLink.textContent = "Edit details";
    editLink.dataset.managedSquadEditLink = membershipId;
    editLink.className =
      "inline-flex items-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15";

    const removeForm = Array.from(actionsContainer.querySelectorAll("form")).find(
      (candidate) => candidate !== form && Boolean(candidate.querySelector('input[name="membershipId"]')),
    );

    actionsContainer.insertBefore(editLink, removeForm ?? null);
  }
}

export default function ManagedSquadEditLinks() {
  const pathname = usePathname();

  useEffect(() => {
    addManagedSquadEditLinks(pathname);
  }, [pathname]);

  return null;
}
