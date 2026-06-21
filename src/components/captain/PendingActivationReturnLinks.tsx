// ========================================
// File: src/components/captain/PendingActivationReturnLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function teamId(pathname: string) {
  return pathname.match(/\/captain\/team\/([^/]+)\/(?:squad|prospects)(?:\/)?$/)?.[1] ?? null;
}

function prospectId(href: string) {
  return href.match(/\/prospects\/([^/]+)\/communications(?:\?|#|$)/)?.[1] ?? null;
}

function addPendingActivationButtons(pathname: string) {
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

function getProspectCard(id: string) {
  const input = document.querySelector<HTMLInputElement>(`input[name="prospectId"][value="${CSS.escape(id)}"]`);
  if (!input) return null;

  let current: HTMLElement | null = input;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (className.includes("space-y-5") && className.includes("px-6") && className.includes("py-5")) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getProspectActionArea(card: HTMLElement, id: string) {
  const forms = Array.from(card.querySelectorAll<HTMLFormElement>("form"));

  for (const form of forms) {
    const input = form.querySelector<HTMLInputElement>('input[name="prospectId"]');
    const button = form.querySelector<HTMLButtonElement>("button");

    if (input?.value === id && button?.textContent?.includes("Promote to squad")) {
      return form.parentElement instanceof HTMLElement ? form.parentElement : null;
    }
  }

  return null;
}

function addTeamProspectPoolButtons(pathname: string) {
  const currentTeamId = teamId(pathname);
  if (!currentTeamId) return;

  const ids = new Set<string>();
  document.querySelectorAll<HTMLInputElement>('input[name="prospectId"]').forEach((input) => {
    const value = input.value.trim();
    if (value) ids.add(value);
  });

  for (const id of ids) {
    const card = getProspectCard(id);
    if (!card || card.querySelector(`[data-move-team-prospect-to-pool="${id}"]`)) continue;

    const actions = getProspectActionArea(card, id);
    if (!actions) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Move to main prospects";
    button.dataset.moveTeamProspectToPool = id;
    button.className = "inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50";
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Moving…";
      const response = await fetch(`/api/captain/team/${currentTeamId}/prospects/${id}/unassign`, { method: "POST" });
      if (response.ok) {
        window.location.reload();
        return;
      }
      button.disabled = false;
      button.textContent = "Move to main prospects";
    });

    actions.appendChild(button);
  }
}

export default function PendingActivationReturnLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.endsWith("/squad")) {
      addPendingActivationButtons(pathname);
      return;
    }

    if (pathname.endsWith("/prospects")) {
      addTeamProspectPoolButtons(pathname);
    }
  }, [pathname]);

  return null;
}
