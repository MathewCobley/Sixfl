// ========================================
// File: src/components/captain/PendingActivationReturnLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function teamId(pathname: string) {
  return pathname.match(/\/captain\/team\/([^/]+)\/squad(?:\/)?$/)?.[1] ?? null;
}

function prospectId(href: string) {
  return href.match(/\/prospects\/([^/]+)\/communications(?:\?|#|$)/)?.[1] ?? null;
}

function addButtons(pathname: string) {
  const currentTeamId = teamId(pathname);
  if (!currentTeamId) return;

  document
    .querySelectorAll<HTMLAnchorElement>('#pending-activation a[href*="/prospects/"][href*="/communications"]')
    .forEach((link) => {
      const id = prospectId(link.getAttribute("href") ?? "");
      const actions = link.parentElement;
      if (!id || !(actions instanceof HTMLElement)) return;
      if (actions.querySelector(`[data-return-pending-prospect="${id}"]`)) return;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Return to prospects tab";
      button.dataset.returnPendingProspect = id;
      button.className = "inline-flex w-full items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 text-center text-sm font-medium text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Returning…";
        const response = await fetch(`/api/captain/team/${currentTeamId}/prospects/${id}`, { method: "POST" });
        if (response.ok) {
          window.location.href = "/admin/player-prospects";
          return;
        }
        button.disabled = false;
        button.textContent = "Return to prospects tab";
      });

      actions.appendChild(button);
    });
}

export default function PendingActivationReturnLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/squad")) return;
    addButtons(pathname);
  }, [pathname]);

  return null;
}
