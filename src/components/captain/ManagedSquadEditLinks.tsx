// ========================================
// File: src/components/captain/ManagedSquadEditLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ManagedSquadEditLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.includes("/squad") || pathname.includes("/squad/")) return;

    const teamIdMatch = pathname.match(/\/captain\/team\/([^/]+)\/squad/);
    const teamId = teamIdMatch?.[1];
    if (!teamId) return;

    const addLinks = () => {
      const membershipInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="membershipId"]'),
      );
      const seenMembershipIds = new Set<string>();

      for (const input of membershipInputs) {
        const membershipId = input.value?.trim();
        if (!membershipId || seenMembershipIds.has(membershipId)) continue;

        const form = input.closest("form");
        if (!form?.textContent?.includes("Update role")) continue;

        seenMembershipIds.add(membershipId);

        const actionsContainer = form.parentElement;
        if (!actionsContainer) continue;

        const existingLink = actionsContainer.querySelector(
          `[data-managed-squad-edit-link="${membershipId}"]`,
        );
        if (existingLink) continue;

        const editLink = document.createElement("a");
        editLink.href = `/captain/team/${teamId}/squad/${membershipId}/edit`;
        editLink.textContent = "Edit";
        editLink.dataset.managedSquadEditLink = membershipId;
        editLink.className =
          "inline-flex items-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15";

        actionsContainer.insertBefore(editLink, form.nextSibling);
      }
    };

    addLinks();

    const observer = new MutationObserver(addLinks);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
