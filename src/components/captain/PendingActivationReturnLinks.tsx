// ========================================
// File: src/components/captain/PendingActivationReturnLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type PlayerPoolResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type TeamOption = {
  id: string;
  label: string;
};

type TeamOptionsResponse = {
  items?: TeamOption[];
  error?: string;
};

type ChangeTeamResponse = {
  ok?: boolean;
  teamName?: string;
  inviteQueued?: boolean;
  warning?: string | null;
  error?: string;
};

let teamOptionsPromise: Promise<TeamOption[]> | null = null;

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

function getProspectName(card: HTMLElement) {
  return (
    card.querySelector<HTMLElement>(".text-base.font-semibold.text-white")?.textContent?.trim() ||
    "this player"
  );
}

function getProspectEmail(card: HTMLElement) {
  return card.querySelector<HTMLInputElement>('input[name="email"]')?.value.trim() || "";
}

async function getTeamOptions() {
  if (!teamOptionsPromise) {
    teamOptionsPromise = fetch("/api/admin/player-prospects/change-team", {
      method: "GET",
      cache: "no-store",
    }).then(async (response) => {
      const payload = (await response.json().catch(() => null)) as TeamOptionsResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The team list could not be loaded.");
      }

      return Array.isArray(payload?.items) ? payload.items : [];
    });
  }

  try {
    return await teamOptionsPromise;
  } catch (error) {
    teamOptionsPromise = null;
    throw error;
  }
}

function createPlayerPoolButton(card: HTMLElement, id: string) {
  const button = document.createElement("button");
  const email = getProspectEmail(card);

  button.type = "button";
  button.dataset.sendTeamProspectToPlayerPool = id;
  button.textContent = email ? "Send to PlayerPool" : "Add email to send to PlayerPool";
  button.disabled = !email;
  button.className =
    "inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/35";

  if (!email) {
    button.title = "Save an email address first.";
    return button;
  }

  button.addEventListener("click", async () => {
    const playerName = getProspectName(card);
    const confirmed = window.confirm(
      `Send ${playerName} a SIXFL PlayerPool profile form? They will stay in their current squad.`,
    );

    if (!confirmed) return;

    const originalText = button.textContent || "Send to PlayerPool";
    button.disabled = true;
    button.textContent = "Sending…";

    const response = await fetch(`/api/admin/player-prospects/${id}/player-pool`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const payload = (await response.json().catch(() => null)) as PlayerPoolResponse | null;

    if (!response.ok || !payload?.ok) {
      window.alert(payload?.error || "The PlayerPool form could not be sent.");
      button.disabled = false;
      button.textContent = originalText;
      return;
    }

    window.alert(payload.message || "PlayerPool profile form sent.");
    window.location.reload();
  });

  return button;
}

function createChangeTeamButton(card: HTMLElement, id: string, currentTeamId: string) {
  const button = document.createElement("button");

  button.type = "button";
  button.dataset.changeTeamProspect = id;
  button.textContent = "Move to another team";
  button.className =
    "inline-flex w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50";

  button.addEventListener("click", async () => {
    const existingPanel = card.querySelector<HTMLElement>(
      `[data-change-team-prospect-panel="${CSS.escape(id)}"]`,
    );

    if (existingPanel) {
      existingPanel.remove();
      button.textContent = "Move to another team";
      return;
    }

    button.disabled = true;
    button.textContent = "Loading teams…";

    let options: TeamOption[];

    try {
      options = (await getTeamOptions()).filter((team) => team.id !== currentTeamId);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "The team list could not be loaded.",
      );
      button.disabled = false;
      button.textContent = "Move to another team";
      return;
    }

    button.disabled = false;
    button.textContent = "Hide team move";

    if (options.length === 0) {
      window.alert("There are no other teams available to move this player to.");
      button.textContent = "Move to another team";
      return;
    }

    const panel = document.createElement("div");
    panel.dataset.changeTeamProspectPanel = id;
    panel.className =
      "space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-3";

    const selectLabel = document.createElement("label");
    selectLabel.className = "block space-y-2 text-xs font-semibold text-cyan-100";

    const selectText = document.createElement("span");
    selectText.textContent = "Move player to";

    const select = document.createElement("select");
    select.className =
      "h-11 w-full rounded-xl border border-white/15 bg-black/70 px-3 text-sm text-white outline-none transition focus:border-cyan-300";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose new team";
    select.appendChild(placeholder);

    for (const option of options) {
      const element = document.createElement("option");
      element.value = option.id;
      element.textContent = option.label;
      select.appendChild(element);
    }

    selectLabel.append(selectText, select);

    const inviteLabel = document.createElement("label");
    inviteLabel.className =
      "flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/70";

    const inviteCheckbox = document.createElement("input");
    inviteCheckbox.type = "checkbox";
    inviteCheckbox.checked = true;
    inviteCheckbox.className = "mt-1 h-4 w-4 accent-emerald-500";

    const inviteText = document.createElement("span");
    inviteText.textContent =
      "Send a fresh squad invite for the new team. This is recommended if an earlier invite named the old team.";

    inviteLabel.append(inviteCheckbox, inviteText);

    const controls = document.createElement("div");
    controls.className = "grid grid-cols-2 gap-2";

    const moveButton = document.createElement("button");
    moveButton.type = "button";
    moveButton.textContent = "Move player";
    moveButton.disabled = true;
    moveButton.className =
      "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    cancelButton.className =
      "inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-white/70 transition hover:bg-white/[0.08]";

    select.addEventListener("change", () => {
      moveButton.disabled = !select.value;
    });

    cancelButton.addEventListener("click", () => {
      panel.remove();
      button.textContent = "Move to another team";
    });

    moveButton.addEventListener("click", async () => {
      const targetTeamId = select.value;
      const selectedOption = options.find((option) => option.id === targetTeamId);
      if (!targetTeamId) return;

      const playerName = getProspectName(card);
      const inviteCopy = inviteCheckbox.checked
        ? " A fresh squad invite will also be queued."
        : " No new squad invite will be sent.";
      const confirmed = window.confirm(
        `Move ${playerName} to ${selectedOption?.label ?? "the selected team"}?${inviteCopy}`,
      );

      if (!confirmed) return;

      moveButton.disabled = true;
      cancelButton.disabled = true;
      select.disabled = true;
      inviteCheckbox.disabled = true;
      button.disabled = true;
      moveButton.textContent = "Moving…";

      const response = await fetch("/api/admin/player-prospects/change-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: id,
          teamId: targetTeamId,
          sendInvite: inviteCheckbox.checked,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ChangeTeamResponse | null;

      if (!response.ok || !payload?.ok) {
        window.alert(payload?.error || "The player's team could not be changed.");
        moveButton.disabled = false;
        cancelButton.disabled = false;
        select.disabled = false;
        inviteCheckbox.disabled = false;
        button.disabled = false;
        moveButton.textContent = "Move player";
        return;
      }

      const successMessage = payload.warning
        ? payload.warning
        : `${playerName} has been moved to ${payload.teamName ?? "the selected team"}${
            payload.inviteQueued ? " and a fresh squad invite was queued" : ""
          }.`;
      window.alert(successMessage);
      window.location.reload();
    });

    controls.append(moveButton, cancelButton);
    panel.append(selectLabel, inviteLabel, controls);
    button.insertAdjacentElement("afterend", panel);
  });

  return button;
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
    if (!card) continue;

    const actions = getProspectActionArea(card, id);
    if (!actions) continue;

    if (!card.querySelector(`[data-send-team-prospect-to-player-pool="${id}"]`)) {
      actions.appendChild(createPlayerPoolButton(card, id));
    }

    if (!card.querySelector(`[data-change-team-prospect="${id}"]`)) {
      actions.appendChild(createChangeTeamButton(card, id, currentTeamId));
    }

    if (card.querySelector(`[data-move-team-prospect-to-pool="${id}"]`)) continue;

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
