// ========================================
// File: src/components/admin/player-prospects/PlayerProspectsNotInterestedBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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

function getProspectId(card: HTMLElement) {
  const hiddenId = card.querySelector<HTMLInputElement>(
    'input[name="prospectId"]',
  )?.value.trim();
  if (hiddenId) return hiddenId;

  const href = card
    .querySelector<HTMLAnchorElement>(
      'a[href^="/admin/player-prospects/"][href$="/communications"]',
    )
    ?.getAttribute("href");

  return href?.match(/\/admin\/player-prospects\/([^/]+)\/communications/)?.[1] ?? null;
}

function getProspectCards() {
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(
      'article:has(a[href^="/admin/player-prospects/"][href$="/communications"])',
    ),
  );

  return cards.length
    ? cards
    : Array.from(
        document.querySelectorAll<HTMLAnchorElement>(
          'a[href^="/admin/player-prospects/"][href$="/communications"]',
        ),
      ).flatMap((link) => {
        const card = link.closest<HTMLElement>("article");
        return card ? [card] : [];
      });
}

function getActionArea(card: HTMLElement) {
  const assignForm = Array.from(card.querySelectorAll<HTMLFormElement>("form")).find(
    (form) => form.querySelector('input[name="prospectId"]'),
  );

  if (assignForm?.parentElement instanceof HTMLElement) {
    return assignForm.parentElement;
  }

  const commsLink = card.querySelector<HTMLAnchorElement>(
    'a[href^="/admin/player-prospects/"][href$="/communications"]',
  );

  return commsLink?.parentElement instanceof HTMLElement
    ? commsLink.parentElement
    : null;
}

function getTeamPanel(card: HTMLElement) {
  return (
    Array.from(card.querySelectorAll<HTMLElement>(".rounded-2xl")).find(
      (panel) =>
        panel.textContent?.includes("Currently held under") ||
        panel.textContent?.includes("Active team"),
    ) ?? null
  );
}

function getCurrentTeamId(card: HTMLElement) {
  const href = card
    .querySelector<HTMLAnchorElement>(
      'a[href^="/admin/teams/"][href$="/squad"]',
    )
    ?.getAttribute("href");

  return href?.match(/\/admin\/teams\/([^/]+)\/squad/)?.[1] ?? null;
}

function isClosed(card: HTMLElement) {
  const text = card.textContent ?? "";
  return (
    text.includes("Closed record") ||
    text.includes("Duplicate record") ||
    text.includes("Not interested") ||
    text.includes("Duplicated")
  );
}

function isActivePlayer(card: HTMLElement) {
  return (card.textContent ?? "").includes("Active player");
}

async function loadTeamOptions() {
  if (!teamOptionsPromise) {
    teamOptionsPromise = fetch("/api/admin/player-prospects/change-team", {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | TeamOptionsResponse
          | null;

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

function makeActionButton(input: {
  label: string;
  tone: "sky" | "red" | "orange";
  onClick: (button: HTMLButtonElement) => Promise<void>;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = input.label;

  const toneClasses =
    input.tone === "red"
      ? "border-red-400/25 bg-red-500/10 text-red-100 hover:bg-red-500/15"
      : input.tone === "orange"
        ? "border-orange-400/25 bg-orange-500/10 text-orange-100 hover:bg-orange-500/15"
        : "border-sky-400/25 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15";

  button.className = `inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses}`;
  button.addEventListener("click", () => void input.onClick(button));
  return button;
}

async function postProspectAction(input: {
  endpoint: string;
  button: HTMLButtonElement;
  busyLabel: string;
  restoreLabel: string;
}) {
  input.button.disabled = true;
  input.button.textContent = input.busyLabel;

  try {
    const response = await fetch(input.endpoint, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || "That change could not be saved.");
    }

    window.location.reload();
  } catch (error) {
    input.button.disabled = false;
    input.button.textContent = input.restoreLabel;
    window.alert(
      error instanceof Error ? error.message : "That change could not be saved.",
    );
  }
}

function addChangeTeamControl(input: {
  card: HTMLElement;
  panel: HTMLElement;
  prospectId: string;
  currentTeamId: string;
}) {
  if (input.card.querySelector(`[data-prospect-change-team="${CSS.escape(input.prospectId)}"]`)) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.dataset.prospectChangeTeam = input.prospectId;
  wrapper.className = "mt-3 space-y-2";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Change team";
  toggle.className =
    "inline-flex w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50";

  const formPanel = document.createElement("div");
  formPanel.hidden = true;
  formPanel.className =
    "space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-3";

  const select = document.createElement("select");
  select.disabled = true;
  select.className =
    "h-11 w-full rounded-xl border border-white/15 bg-black/70 px-3 text-sm text-white outline-none transition focus:border-cyan-300 disabled:opacity-50";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose new team";
  select.appendChild(placeholder);

  const inviteLabel = document.createElement("label");
  inviteLabel.className =
    "flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/70";

  const invite = document.createElement("input");
  invite.type = "checkbox";
  invite.checked = true;
  invite.className = "mt-1 h-4 w-4 accent-emerald-500";

  const inviteText = document.createElement("span");
  inviteText.textContent =
    "Send a fresh squad invite for the new team. This is recommended when an earlier invite named the old team.";
  inviteLabel.append(invite, inviteText);

  const row = document.createElement("div");
  row.className = "grid grid-cols-2 gap-2";

  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.disabled = true;
  confirm.textContent = "Confirm change";
  confirm.className =
    "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.className =
    "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10";

  row.append(confirm, cancel);
  formPanel.append(select, inviteLabel, row);
  wrapper.append(toggle, formPanel);
  input.panel.appendChild(wrapper);

  let loaded = false;

  toggle.addEventListener("click", async () => {
    if (!formPanel.hidden) {
      formPanel.hidden = true;
      toggle.textContent = "Change team";
      return;
    }

    if (!loaded) {
      toggle.disabled = true;
      toggle.textContent = "Loading teams…";

      try {
        const options = (await loadTeamOptions()).filter(
          (option) => option.id !== input.currentTeamId,
        );

        for (const option of options) {
          const element = document.createElement("option");
          element.value = option.id;
          element.textContent = option.label;
          select.appendChild(element);
        }

        if (options.length === 0) {
          throw new Error("There are no other teams available.");
        }

        loaded = true;
        select.disabled = false;
      } catch (error) {
        window.alert(
          error instanceof Error
            ? error.message
            : "The team list could not be loaded.",
        );
        toggle.disabled = false;
        toggle.textContent = "Change team";
        return;
      }

      toggle.disabled = false;
    }

    formPanel.hidden = false;
    toggle.textContent = "Hide team change";
  });

  select.addEventListener("change", () => {
    confirm.disabled = !select.value;
  });

  cancel.addEventListener("click", () => {
    select.value = "";
    confirm.disabled = true;
    formPanel.hidden = true;
    toggle.textContent = "Change team";
  });

  confirm.addEventListener("click", async () => {
    const teamId = select.value.trim();
    const option = select.selectedOptions[0];
    if (!teamId || !option) return;

    const inviteMessage = invite.checked
      ? " A fresh squad invite will also be sent."
      : " No new invite will be sent.";

    if (
      !window.confirm(
        `Move this player to ${option.textContent ?? "the selected team"}?${inviteMessage}`,
      )
    ) {
      return;
    }

    confirm.disabled = true;
    cancel.disabled = true;
    toggle.disabled = true;
    select.disabled = true;
    invite.disabled = true;
    confirm.textContent = "Changing…";

    try {
      const response = await fetch("/api/admin/player-prospects/change-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: input.prospectId,
          teamId,
          sendInvite: invite.checked,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ChangeTeamResponse
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "The player's team could not be changed.",
        );
      }

      if (payload.warning) window.alert(payload.warning);
      window.location.reload();
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "The player's team could not be changed.",
      );
      confirm.disabled = false;
      cancel.disabled = false;
      toggle.disabled = false;
      select.disabled = false;
      invite.disabled = false;
      confirm.textContent = "Confirm change";
    }
  });
}

function addButtons() {
  for (const card of getProspectCards()) {
    const prospectId = getProspectId(card);
    if (!prospectId || isClosed(card)) continue;

    const actionArea = getActionArea(card);
    if (!actionArea) continue;

    const currentTeamId = getCurrentTeamId(card);
    const active = isActivePlayer(card);

    if (currentTeamId && !active) {
      const teamPanel = getTeamPanel(card);
      if (teamPanel) {
        addChangeTeamControl({
          card,
          panel: teamPanel,
          prospectId,
          currentTeamId,
        });
      }
    }

    if (
      currentTeamId &&
      !card.querySelector(
        `[data-prospect-unassign="${CSS.escape(prospectId)}"]`,
      )
    ) {
      const button = makeActionButton({
        label: "Move to main prospects",
        tone: "sky",
        onClick: async (target) => {
          if (!window.confirm("Move this player back to the main prospect pool?")) {
            return;
          }
          await postProspectAction({
            endpoint: `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/unassign`,
            button: target,
            busyLabel: "Moving…",
            restoreLabel: "Move to main prospects",
          });
        },
      });
      button.dataset.prospectUnassign = prospectId;
      actionArea.appendChild(button);
    }

    if (
      !active &&
      !card.querySelector(
        `[data-prospect-not-interested="${CSS.escape(prospectId)}"]`,
      )
    ) {
      const button = makeActionButton({
        label: "Move to not interested",
        tone: "red",
        onClick: async (target) => {
          if (!window.confirm("Move this player to Not interested?")) return;
          await postProspectAction({
            endpoint: `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/not-interested`,
            button: target,
            busyLabel: "Moving…",
            restoreLabel: "Move to not interested",
          });
        },
      });
      button.dataset.prospectNotInterested = prospectId;
      actionArea.appendChild(button);
    }

    if (
      !active &&
      !card.querySelector(
        `[data-prospect-duplicate="${CSS.escape(prospectId)}"]`,
      )
    ) {
      const button = makeActionButton({
        label: "Remove duplicate",
        tone: "orange",
        onClick: async (target) => {
          if (
            !window.confirm(
              "Mark this prospect as a duplicate record? It will leave the open pipeline.",
            )
          ) {
            return;
          }
          await postProspectAction({
            endpoint: `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/duplicate`,
            button: target,
            busyLabel: "Moving…",
            restoreLabel: "Remove duplicate",
          });
        },
      });
      button.dataset.prospectDuplicate = prospectId;
      actionArea.appendChild(button);
    }
  }
}

export default function PlayerProspectsNotInterestedBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/admin/player-prospects") return;

    const run = () => addButtons();
    const frame = window.requestAnimationFrame(run);
    const retry = window.setTimeout(run, 250);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [pathname, searchKey]);

  return null;
}
