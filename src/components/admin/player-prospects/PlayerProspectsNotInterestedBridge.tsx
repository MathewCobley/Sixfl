// ========================================
// File: src/components/admin/player-prospects/PlayerProspectsNotInterestedBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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

function getProspectIdFromCommsHref(href: string) {
  return href.match(/\/prospects\/([^/]+)\/communications(?:\?|#|$)/)?.[1] ?? null;
}

function getProspectIds() {
  const ids = new Set<string>();

  document
    .querySelectorAll<HTMLInputElement>('form input[name="prospectId"]')
    .forEach((input) => {
      const value = input.value.trim();
      if (value) ids.add(value);
    });

  document
    .querySelectorAll<HTMLAnchorElement>('a[href*="/prospects/"][href*="/communications"]')
    .forEach((link) => {
      const value = getProspectIdFromCommsHref(link.getAttribute("href") ?? "");
      if (value) ids.add(value);
    });

  return Array.from(ids);
}

function getCardForProspectId(prospectId: string) {
  const input = document.querySelector<HTMLInputElement>(
    `form input[name="prospectId"][value="${CSS.escape(prospectId)}"]`,
  );
  const link = document.querySelector<HTMLAnchorElement>(
    `a[href*="/prospects/${CSS.escape(prospectId)}/communications"]`,
  );
  const start = input ?? link;

  if (!start) return null;

  let current: HTMLElement | null = start;

  while (current && current.tagName !== "MAIN") {
    const className = typeof current.className === "string" ? current.className : "";

    if (
      current.tagName === "ARTICLE" ||
      (className.includes("rounded-3xl") && className.includes("p-5"))
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getActionArea(card: HTMLElement) {
  const assignForm = card
    .querySelector<HTMLFormElement>('form input[name="prospectId"]')
    ?.closest("form");

  if (assignForm?.parentElement instanceof HTMLElement) {
    return assignForm.parentElement;
  }

  const commsLink = card.querySelector<HTMLAnchorElement>(
    'a[href*="/prospects/"][href*="/communications"]',
  );

  if (commsLink?.parentElement instanceof HTMLElement) {
    return commsLink.parentElement;
  }

  return null;
}

function getTeamPanel(card: HTMLElement) {
  return (
    Array.from(card.querySelectorAll<HTMLElement>(".rounded-2xl")).find((element) =>
      element.textContent?.includes("Currently held under"),
    ) ?? null
  );
}

function getCurrentTeamId(card: HTMLElement) {
  const squadLink = card.querySelector<HTMLAnchorElement>(
    'a[href^="/admin/teams/"][href$="/squad"]',
  );
  const href = squadLink?.getAttribute("href") ?? "";
  return href.match(/\/admin\/teams\/([^/]+)\/squad/)?.[1] ?? null;
}

function isClosedProspectCard(card: HTMLElement) {
  const text = card.textContent ?? "";
  return (
    text.includes("Not interested") ||
    text.includes("Duplicated") ||
    text.includes("Duplicate record")
  );
}

function isHeldUnderTeam(card: HTMLElement) {
  const text = card.textContent ?? "";
  return text.includes("Currently held under") || text.includes("Active team");
}

function canChangeTeam(card: HTMLElement) {
  const text = card.textContent ?? "";
  return text.includes("Currently held under") && !text.includes("Active player");
}

async function loadTeamOptions() {
  if (!teamOptionsPromise) {
    teamOptionsPromise = fetch("/api/admin/player-prospects/change-team", {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as TeamOptionsResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error || "The team list could not be loaded.");
        }

        return payload?.items ?? [];
      })
      .catch((error) => {
        teamOptionsPromise = null;
        throw error;
      });
  }

  return teamOptionsPromise;
}

function addChangeTeamControls(input: {
  card: HTMLElement;
  panel: HTMLElement;
  prospectId: string;
  currentTeamId: string;
}) {
  if (input.card.querySelector(`[data-prospect-change-team="${input.prospectId}"]`)) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.dataset.prospectChangeTeam = input.prospectId;
  wrapper.className = "mt-3 space-y-2";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.textContent = "Change team";
  toggleButton.className =
    "inline-flex w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50";

  const changePanel = document.createElement("div");
  changePanel.hidden = true;
  changePanel.className =
    "space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-3";

  const label = document.createElement("label");
  const selectId = `change-team-${input.prospectId}`;
  label.htmlFor = selectId;
  label.className = "block text-xs font-semibold text-cyan-100";
  label.textContent = "Move player to";

  const select = document.createElement("select");
  select.id = selectId;
  select.disabled = true;
  select.className =
    "h-11 w-full rounded-xl border border-white/15 bg-black/70 px-3 text-sm text-white outline-none transition focus:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-50";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose new team";
  select.appendChild(placeholder);

  const inviteLabel = document.createElement("label");
  inviteLabel.className =
    "flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/70";

  const inviteCheckbox = document.createElement("input");
  inviteCheckbox.type = "checkbox";
  inviteCheckbox.checked = true;
  inviteCheckbox.className = "mt-1 h-4 w-4 accent-emerald-500";

  const inviteText = document.createElement("span");
  inviteText.textContent =
    "Send a fresh squad invite for the new team. This is recommended when an earlier invite named the old team.";

  inviteLabel.appendChild(inviteCheckbox);
  inviteLabel.appendChild(inviteText);

  const buttonRow = document.createElement("div");
  buttonRow.className = "grid grid-cols-2 gap-2";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.disabled = true;
  confirmButton.textContent = "Confirm change";
  confirmButton.className =
    "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.className =
    "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10";

  buttonRow.appendChild(confirmButton);
  buttonRow.appendChild(cancelButton);
  changePanel.appendChild(label);
  changePanel.appendChild(select);
  changePanel.appendChild(inviteLabel);
  changePanel.appendChild(buttonRow);
  wrapper.appendChild(toggleButton);
  wrapper.appendChild(changePanel);
  input.panel.appendChild(wrapper);

  let optionsLoaded = false;

  toggleButton.addEventListener("click", async () => {
    if (!changePanel.hidden) {
      changePanel.hidden = true;
      toggleButton.textContent = "Change team";
      return;
    }

    if (!optionsLoaded) {
      toggleButton.disabled = true;
      toggleButton.textContent = "Loading teams…";

      try {
        const options = (await loadTeamOptions()).filter(
          (option) => option.id !== input.currentTeamId,
        );

        if (options.length === 0) {
          throw new Error("There are no other teams available.");
        }

        for (const option of options) {
          const element = document.createElement("option");
          element.value = option.id;
          element.textContent = option.label;
          select.appendChild(element);
        }

        select.disabled = false;
        optionsLoaded = true;
      } catch (error) {
        alert(
          error instanceof Error && error.message
            ? error.message
            : "The team list could not be loaded.",
        );
        toggleButton.disabled = false;
        toggleButton.textContent = "Change team";
        return;
      }

      toggleButton.disabled = false;
    }

    changePanel.hidden = false;
    toggleButton.textContent = "Hide team change";
  });

  select.addEventListener("change", () => {
    confirmButton.disabled = !select.value;
  });

  cancelButton.addEventListener("click", () => {
    select.value = "";
    confirmButton.disabled = true;
    changePanel.hidden = true;
    toggleButton.textContent = "Change team";
  });

  confirmButton.addEventListener("click", async () => {
    const teamId = select.value.trim();
    const selectedOption = select.selectedOptions[0];

    if (!teamId || !selectedOption) return;

    const inviteMessage = inviteCheckbox.checked
      ? " A fresh squad invite will also be sent."
      : " No new invite will be sent.";
    const confirmed = window.confirm(
      `Move this player to ${selectedOption.textContent ?? "the selected team"}?${inviteMessage}`,
    );

    if (!confirmed) return;

    confirmButton.disabled = true;
    cancelButton.disabled = true;
    toggleButton.disabled = true;
    select.disabled = true;
    inviteCheckbox.disabled = true;
    confirmButton.textContent = "Changing…";

    const response = await fetch("/api/admin/player-prospects/change-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospectId: input.prospectId,
        teamId,
        sendInvite: inviteCheckbox.checked,
      }),
    });
    const payload = (await response.json().catch(() => null)) as ChangeTeamResponse | null;

    if (!response.ok || !payload?.ok) {
      alert(payload?.error || "The player's team could not be changed.");
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      toggleButton.disabled = false;
      select.disabled = false;
      inviteCheckbox.disabled = false;
      confirmButton.textContent = "Confirm change";
      return;
    }

    if (payload.warning) {
      alert(payload.warning);
    }

    window.location.reload();
  });
}

async function moveProspectToMainPool(input: {
  prospectId: string;
  button: HTMLButtonElement;
}) {
  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(`/api/admin/player-prospects/${input.prospectId}/unassign`, {
    method: "POST",
  });

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Move to main prospects";
}

async function moveProspectToNotInterested(input: {
  prospectId: string;
  button: HTMLButtonElement;
}) {
  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(
    `/api/admin/player-prospects/${input.prospectId}/not-interested`,
    {
      method: "POST",
    },
  );

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Move to not interested";
}

async function flagProspectAsDuplicate(input: {
  prospectId: string;
  button: HTMLButtonElement;
}) {
  const confirmed = window.confirm(
    "Mark this prospect as a duplicate record? It will leave the open pipeline and move to the duplicated records section.",
  );

  if (!confirmed) return;

  input.button.disabled = true;
  input.button.textContent = "Moving…";

  const response = await fetch(`/api/admin/player-prospects/${input.prospectId}/duplicate`, {
    method: "POST",
  });

  if (response.ok) {
    window.location.reload();
    return;
  }

  input.button.disabled = false;
  input.button.textContent = "Remove duplicate";
}

function addButtons() {
  for (const prospectId of getProspectIds()) {
    const card = getCardForProspectId(prospectId);
    if (!card || isClosedProspectCard(card)) {
      continue;
    }

    const actionArea = getActionArea(card);
    if (!actionArea) continue;

    if (canChangeTeam(card)) {
      const teamPanel = getTeamPanel(card);
      const currentTeamId = getCurrentTeamId(card);

      if (teamPanel && currentTeamId) {
        addChangeTeamControls({
          card,
          panel: teamPanel,
          prospectId,
          currentTeamId,
        });
      }
    }

    if (
      isHeldUnderTeam(card) &&
      !card.querySelector(`button[data-prospect-unassign="${prospectId}"]`)
    ) {
      const poolButton = document.createElement("button");
      poolButton.type = "button";
      poolButton.textContent = "Move to main prospects";
      poolButton.dataset.prospectUnassign = prospectId;
      poolButton.className =
        "inline-flex w-full items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      poolButton.addEventListener("click", () => {
        void moveProspectToMainPool({ prospectId, button: poolButton });
      });

      actionArea.appendChild(poolButton);
    }

    if (!card.querySelector(`button[data-prospect-not-interested="${prospectId}"]`)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Move to not interested";
      button.dataset.prospectNotInterested = prospectId;
      button.className =
        "inline-flex w-full items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      button.addEventListener("click", () => {
        void moveProspectToNotInterested({ prospectId, button });
      });

      actionArea.appendChild(button);
    }

    if (!card.querySelector(`button[data-prospect-duplicate="${prospectId}"]`)) {
      const duplicateButton = document.createElement("button");
      duplicateButton.type = "button";
      duplicateButton.textContent = "Remove duplicate";
      duplicateButton.dataset.prospectDuplicate = prospectId;
      duplicateButton.className =
        "inline-flex w-full items-center justify-center rounded-xl border border-orange-400/25 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-100 transition hover:bg-orange-500/15 disabled:cursor-not-allowed disabled:opacity-50";
      duplicateButton.addEventListener("click", () => {
        void flagProspectAsDuplicate({ prospectId, button: duplicateButton });
      });

      actionArea.appendChild(duplicateButton);
    }
  }
}

export default function PlayerProspectsNotInterestedBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/player-prospects") return;

    addButtons();

    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
