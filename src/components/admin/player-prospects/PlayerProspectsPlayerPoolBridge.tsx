// ========================================
// File: src/components/admin/player-prospects/PlayerProspectsPlayerPoolBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SendToPlayerPoolResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

type PlayerPoolProfileSummary = {
  id: string;
  prospectId: string;
  publicCode: string;
  status: string;
  invitedAt: string | null;
  profileSubmittedAt: string | null;
  updatedAt: string;
};

type PlayerPoolStatusResponse = {
  ok?: boolean;
  exists?: boolean;
  profile?: PlayerPoolProfileSummary | null;
  error?: string;
};

const statusRequests = new Map<
  string,
  Promise<PlayerPoolProfileSummary | null>
>();

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
  const assignForm = Array.from(card.querySelectorAll<HTMLFormElement>("form")).find(
    (form) => form.querySelector('input[name="prospectId"]'),
  );

  return assignForm?.parentElement instanceof HTMLElement
    ? assignForm.parentElement
    : null;
}

function isEligibleUnassignedCard(card: HTMLElement) {
  const text = card.textContent ?? "";
  const hasNoEmail = Array.from(card.querySelectorAll("span")).some(
    (span) => span.textContent?.trim() === "No email",
  );

  return (
    text.includes("Unassigned prospect") &&
    !text.includes("Active player") &&
    !text.includes("Not interested") &&
    !text.includes("Duplicated") &&
    !text.includes("Duplicate record") &&
    !hasNoEmail
  );
}

function formatPlayerPoolStatus(status: string) {
  switch (status) {
    case "INVITED":
      return "Invited";
    case "AVAILABLE":
      return "Available";
    case "INTRODUCTION_REQUESTED":
      return "Introduction requested";
    case "TRIAL_ARRANGED":
      return "Trial arranged";
    case "JOINED":
      return "Joined";
    case "PAUSED":
      return "Paused";
    case "NOT_LOOKING":
      return "Not looking";
    default:
      return status
        .split("_")
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(" ");
  }
}

function playerPoolStatusClasses(status: string) {
  switch (status) {
    case "INVITED":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "AVAILABLE":
    case "INTRODUCTION_REQUESTED":
    case "TRIAL_ARRANGED":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "JOINED":
      return "border-sky-400/30 bg-sky-500/10 text-sky-100";
    case "PAUSED":
      return "border-violet-400/30 bg-violet-500/10 text-violet-100";
    case "NOT_LOOKING":
      return "border-red-400/30 bg-red-500/10 text-red-100";
    default:
      return "border-white/15 bg-white/[0.05] text-white/75";
  }
}

function addPlayerPoolBadge(
  card: HTMLElement,
  prospectId: string,
  profile: PlayerPoolProfileSummary,
) {
  const existing = card.querySelector<HTMLElement>(
    `[data-prospect-player-pool-status="${CSS.escape(prospectId)}"]`,
  );
  const label = `PlayerPool · ${formatPlayerPoolStatus(profile.status)}`;

  if (existing) {
    existing.textContent = label;
    existing.className = `rounded-full border px-2.5 py-1 text-[11px] font-medium ${playerPoolStatusClasses(
      profile.status,
    )}`;
    return;
  }

  const heading = card.querySelector("h3");
  const badgeArea = heading?.parentElement;
  if (!(badgeArea instanceof HTMLElement)) return;

  const badge = document.createElement("span");
  badge.dataset.prospectPlayerPoolStatus = prospectId;
  badge.textContent = label;
  badge.title = `PlayerPool profile ${profile.publicCode}`;
  badge.className = `rounded-full border px-2.5 py-1 text-[11px] font-medium ${playerPoolStatusClasses(
    profile.status,
  )}`;
  badgeArea.appendChild(badge);
}

function loadPlayerPoolStatus(prospectId: string) {
  const existingRequest = statusRequests.get(prospectId);
  if (existingRequest) return existingRequest;

  const request = fetch(
    `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/player-pool`,
    { cache: "no-store" },
  )
    .then(async (response) => {
      const payload = (await response.json().catch(() => null)) as
        | PlayerPoolStatusResponse
        | null;

      if (!response.ok || !payload?.ok || !payload.exists) return null;
      return payload.profile ?? null;
    })
    .catch(() => null);

  statusRequests.set(prospectId, request);
  return request;
}

async function sendToPlayerPool(input: {
  prospectId: string;
  playerName: string;
  button: HTMLButtonElement;
  existingProfile: boolean;
}) {
  const confirmed = window.confirm(
    input.existingProfile
      ? `Resend ${input.playerName}'s SIXFL PlayerPool profile form?`
      : `Send ${input.playerName} a SIXFL PlayerPool profile form?`,
  );

  if (!confirmed) return;

  const originalText = input.button.textContent || "Send to PlayerPool";
  input.button.disabled = true;
  input.button.textContent = input.existingProfile ? "Resending…" : "Sending…";

  const leagueId = new URLSearchParams(window.location.search).get("leagueId");
  const response = await fetch(
    `/api/admin/player-prospects/${input.prospectId}/player-pool`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId }),
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | SendToPlayerPoolResponse
    | null;

  if (!response.ok || !payload?.ok) {
    alert(payload?.error || "The PlayerPool form could not be sent.");
    input.button.disabled = false;
    input.button.textContent = originalText;
    return;
  }

  alert(payload.message || "PlayerPool form sent.");
  statusRequests.delete(input.prospectId);
  window.location.reload();
}

function ensurePlayerPoolButton(input: {
  card: HTMLElement;
  prospectId: string;
  profile: PlayerPoolProfileSummary | null;
}) {
  if (!isEligibleUnassignedCard(input.card)) return;

  const actionArea = getActionArea(input.card);
  if (!actionArea) return;

  let button = input.card.querySelector<HTMLButtonElement>(
    `[data-prospect-player-pool="${CSS.escape(input.prospectId)}"]`,
  );

  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.prospectPlayerPool = input.prospectId;
    button.className =
      "inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50";

    const destructiveButton =
      actionArea.querySelector<HTMLElement>(
        `[data-prospect-not-interested="${input.prospectId}"]`,
      ) ??
      actionArea.querySelector<HTMLElement>(
        `[data-prospect-duplicate="${input.prospectId}"]`,
      );

    actionArea.insertBefore(button, destructiveButton ?? null);
  }

  const existingProfile = Boolean(input.profile);
  button.textContent = existingProfile
    ? input.profile?.status === "INVITED"
      ? "Resend PlayerPool invite"
      : "Resend PlayerPool form"
    : "Send to PlayerPool";

  if (button.dataset.playerPoolHandlerAttached === "true") return;

  const playerName =
    input.card.querySelector("h3")?.textContent?.trim() || "this player";
  button.dataset.playerPoolHandlerAttached = "true";
  button.addEventListener("click", () => {
    void sendToPlayerPool({
      prospectId: input.prospectId,
      playerName,
      button: button as HTMLButtonElement,
      existingProfile,
    });
  });
}

async function decorateProspect(prospectId: string) {
  const card = getCardForProspectId(prospectId);
  if (!card) return;

  const profile = await loadPlayerPoolStatus(prospectId);
  if (profile) addPlayerPoolBadge(card, prospectId, profile);
  ensurePlayerPoolButton({ card, prospectId, profile });
}

function syncPlayerPoolCards() {
  for (const prospectId of getProspectIds()) {
    void decorateProspect(prospectId);
  }
}

export default function PlayerProspectsPlayerPoolBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/player-prospects") return;

    statusRequests.clear();
    syncPlayerPoolCards();

    const observer = new MutationObserver(syncPlayerPoolCards);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
