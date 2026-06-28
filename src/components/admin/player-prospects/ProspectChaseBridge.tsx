// ========================================
// File: src/components/admin/player-prospects/ProspectChaseBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import {
  queuePlayerProspectSquadInviteChaseAction,
  queuePlayerProspectSquadInviteFinalChaseAction,
} from "@/app/(admin)/admin/player-prospects/actions";

type ChaseStatusItem = {
  prospectId: string;
  chaseStatus: string | null;
  chaseAt: string | null;
  finalChaseStatus: string | null;
  finalChaseAt: string | null;
};

type ChaseStatusResponse = {
  items?: ChaseStatusItem[];
};

function getProspectIdFromCard(card: Element) {
  const commsLink = card.querySelector<HTMLAnchorElement>(
    "a[href^='/admin/player-prospects/'][href$='/communications']",
  );
  const href = commsLink?.getAttribute("href") ?? "";
  return href.match(/\/admin\/player-prospects\/([^/]+)\/communications/)?.[1] ?? null;
}

function formatWhen(value: string | null) {
  if (!value) return "date unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatStatus(status: string | null) {
  if (!status) return "recorded";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function hasClosedOrResponded(card: Element) {
  const text = card.textContent ?? "";
  return (
    text.includes("Active player") ||
    text.includes("Closed record") ||
    text.includes("Duplicate record") ||
    text.includes("YES — still wants to play") ||
    text.includes("NO — follow up")
  );
}

function hasSquadInviteAlreadySent(card: Element) {
  const text = card.textContent ?? "";
  return /Squad invite\s+(sent|queued|processing|recorded)/i.test(text);
}

function findTeamPanel(card: Element) {
  const panels = Array.from(card.querySelectorAll<HTMLElement>(".rounded-2xl"));

  return (
    panels.find((panel) => panel.textContent?.includes("Currently held under")) ??
    panels.find((panel) => panel.textContent?.includes("Send squad invite")) ??
    null
  );
}

function findStatusGrid(card: Element) {
  return Array.from(card.querySelectorAll<HTMLElement>("div")).find((element) =>
    element.className.includes("sm:grid-cols-3") && element.textContent?.includes("Squad invite"),
  );
}

function makeButton(label: string, tone: "chase" | "final") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className =
    tone === "final"
      ? "inline-flex w-full items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex w-full items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50";
  return button;
}

function setChaseStatusText(card: Element, text: string, tone: "chase" | "final" = "chase") {
  let statusBox = card.querySelector<HTMLElement>("[data-prospect-chase-status='1']");

  if (!statusBox) {
    statusBox = document.createElement("div");
    statusBox.dataset.prospectChaseStatus = "1";
    statusBox.className =
      tone === "final"
        ? "rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100"
        : "rounded-2xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-100";
    statusBox.innerHTML = `<div class="font-semibold">Chase</div><div data-prospect-chase-status-text="1"></div>`;

    const statusGrid = findStatusGrid(card);
    if (statusGrid) {
      statusGrid.appendChild(statusBox);
    } else {
      const teamPanel = findTeamPanel(card);
      teamPanel?.appendChild(statusBox);
    }
  }

  const textElement = statusBox.querySelector<HTMLElement>("[data-prospect-chase-status-text='1']");
  if (textElement) textElement.textContent = text;
}

function attachButtonHandler(input: {
  button: HTMLButtonElement;
  card: Element;
  prospectId: string;
  final: boolean;
}) {
  input.button.addEventListener("click", async () => {
    input.button.disabled = true;
    const originalText = input.button.textContent ?? "";
    input.button.textContent = "Sending...";

    const formData = new FormData();
    formData.append("prospectId", input.prospectId);

    const result = input.final
      ? await queuePlayerProspectSquadInviteFinalChaseAction(formData)
      : await queuePlayerProspectSquadInviteChaseAction(formData);

    if (!result?.ok) {
      input.button.disabled = false;
      input.button.textContent = originalText;
      alert(result?.error || "The chase email could not be sent.");
      return;
    }

    input.button.disabled = false;
    input.button.textContent = input.final ? "Final chase" : "Chase invite";
    setChaseStatusText(
      input.card,
      input.final ? "Final chase queued just now" : "Chase queued just now",
      input.final ? "final" : "chase",
    );
  });
}

function addChaseControls(card: Element) {
  if (card.querySelector("[data-prospect-chase-controls='1']")) return;
  if (hasClosedOrResponded(card)) return;
  if (!hasSquadInviteAlreadySent(card)) return;

  const prospectId = getProspectIdFromCard(card);
  if (!prospectId) return;

  const teamPanel = findTeamPanel(card);
  if (!teamPanel) return;

  const wrapper = document.createElement("div");
  wrapper.dataset.prospectChaseControls = "1";
  wrapper.className = "mt-3 grid gap-2";

  const helper = document.createElement("div");
  helper.className = "text-[11px] leading-4 text-white/40";
  helper.textContent = "Invite sent but not confirmed — chase this player.";

  const chaseButton = makeButton("Chase invite", "chase");
  const finalChaseButton = makeButton("Final chase", "final");

  attachButtonHandler({ button: chaseButton, card, prospectId, final: false });
  attachButtonHandler({ button: finalChaseButton, card, prospectId, final: true });

  wrapper.appendChild(helper);
  wrapper.appendChild(chaseButton);
  wrapper.appendChild(finalChaseButton);
  teamPanel.appendChild(wrapper);
}

function getProspectCards() {
  const commsLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/admin/player-prospects/'][href$='/communications']",
    ),
  );

  return commsLinks.flatMap((link) => {
    const card = link.closest("article");
    return card ? [card] : [];
  });
}

function addChaseControlsToPage() {
  for (const card of getProspectCards()) addChaseControls(card);
}

async function refreshChaseStatuses() {
  const cards = getProspectCards();
  const prospectIds = Array.from(
    new Set(cards.map(getProspectIdFromCard).filter((id): id is string => Boolean(id))),
  );

  if (prospectIds.length === 0) return;

  const response = await fetch(
    `/api/admin/player-prospects/chase-status?ids=${encodeURIComponent(prospectIds.join(","))}`,
    { cache: "no-store" },
  );

  if (!response.ok) return;

  const payload = (await response.json().catch(() => null)) as ChaseStatusResponse | null;
  const byId = new Map((payload?.items ?? []).map((item) => [item.prospectId, item]));

  for (const card of cards) {
    const prospectId = getProspectIdFromCard(card);
    if (!prospectId) continue;

    const item = byId.get(prospectId);
    if (!item) continue;

    if (item.finalChaseAt || item.finalChaseStatus) {
      setChaseStatusText(
        card,
        `Final chase ${formatStatus(item.finalChaseStatus)} ${formatWhen(item.finalChaseAt)}`,
        "final",
      );
    } else if (item.chaseAt || item.chaseStatus) {
      setChaseStatusText(
        card,
        `Chase ${formatStatus(item.chaseStatus)} ${formatWhen(item.chaseAt)}`,
        "chase",
      );
    }
  }
}

export default function ProspectChaseBridge() {
  useEffect(() => {
    addChaseControlsToPage();
    void refreshChaseStatuses();

    const observer = new MutationObserver(() => {
      addChaseControlsToPage();
      void refreshChaseStatuses();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
