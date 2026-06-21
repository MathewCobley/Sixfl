// ========================================
// File: src/components/captain/TeamProspectUnassignLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamId(pathname: string) {
  return pathname.match(/\/captain\/team\/([^/]+)\/prospects(?:\/)?$/)?.[1] ?? null;
}

function getProspectIds() {
  const ids = new Set<string>();

  document
    .querySelectorAll<HTMLInputElement>('input[name="prospectId"]')
    .forEach((input) => {
      const value = input.value.trim();
      if (value) ids.add(value);
    });

  return Array.from(ids);
}

function getCard(prospectId: string) {
  const input = document.querySelector<HTMLInputElement>(`input[name="prospectId"][value="${CSS.escape(prospectId)}"]`);

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

function getActionArea(card: HTMLElement, prospectId: string) {
  const forms = Array.from(card.querySelectorAll<HTMLFormElement>("form"));

  for (const form of forms) {
    const input = form.querySelector<HTMLInputElement>('input[name="prospectId"]');
    const button = form.querySelector<HTMLButtonElement>("button");

    if (input?.value === prospectId && button?.textContent?.includes("Promote to squad")) {
      return form.parentElement instanceof HTMLElement ? form.parentElement : null;
    }
  }

  return null;
}

async function moveToMainProspects(input: {
  teamId: string;
  prospectId: string;
  button: HTMLButtonElement;
}) {
  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(
    `/api/captain/team/${input.teamId}/prospects/${input.prospectId}/unassign`,
    { method: "POST" },
  );

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Move to main prospects";
}

function addButtons(pathname: string) {
  const teamId = getTeamId(pathname);
  if (!teamId) return;

  for (const prospectId of getProspectIds()) {
    const card = getCard(prospectId);
    if (!card || card.querySelector(`button[data-unassign-team-prospect="${prospectId}"]`)) {
      continue;
    }

    const actionArea = getActionArea(card, prospectId);
    if (!actionArea) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Move to main prospects";
    button.dataset.unassignTeamProspect = prospectId;
    button.className =
      "inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50";
    button.addEventListener("click", () => {
      void moveToMainProspects({ teamId, prospectId, button });
    });

    actionArea.appendChild(button);
  }
}

export default function TeamProspectUnassignLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/prospects")) return;

    addButtons(pathname);

    const observer = new MutationObserver(() => addButtons(pathname));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
