// ========================================
// File: src/components/admin/player-prospects/ProspectChaseBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import {
  queuePlayerProspectSquadInviteChaseAction,
  queuePlayerProspectSquadInviteFinalChaseAction,
} from "@/app/(admin)/admin/player-prospects/actions";

function getProspectIdFromCard(card: Element) {
  const commsLink = card.querySelector<HTMLAnchorElement>(
    "a[href^='/admin/player-prospects/'][href$='/communications']",
  );
  const href = commsLink?.getAttribute("href") ?? "";
  return href.match(/\/admin\/player-prospects\/([^/]+)\/communications/)?.[1] ?? null;
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

function attachButtonHandler(input: {
  button: HTMLButtonElement;
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

    input.button.textContent = input.final ? "Final chase queued" : "Chase queued";
    window.setTimeout(() => window.location.reload(), 900);
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

  attachButtonHandler({ button: chaseButton, prospectId, final: false });
  attachButtonHandler({ button: finalChaseButton, prospectId, final: true });

  wrapper.appendChild(helper);
  wrapper.appendChild(chaseButton);
  wrapper.appendChild(finalChaseButton);
  teamPanel.appendChild(wrapper);
}

function addChaseControlsToPage() {
  const commsLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      "a[href^='/admin/player-prospects/'][href$='/communications']",
    ),
  );

  for (const link of commsLinks) {
    const card = link.closest("article");
    if (card) addChaseControls(card);
  }
}

export default function ProspectChaseBridge() {
  useEffect(() => {
    addChaseControlsToPage();

    const observer = new MutationObserver(() => addChaseControlsToPage());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
