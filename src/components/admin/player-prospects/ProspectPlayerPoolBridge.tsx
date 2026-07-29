// ========================================
// File: src/components/admin/player-prospects/ProspectPlayerPoolBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type PlayerPoolProfileState = {
  id: string;
  publicCode: string;
  status: string;
  invitedAt: string | null;
  profileSubmittedAt: string | null;
  updatedAt: string;
};

type PlayerPoolStatePayload = {
  inPlayerPool?: boolean;
  profile?: PlayerPoolProfileState | null;
  error?: string;
};

function getProspectId(article: HTMLElement) {
  const link = article.querySelector<HTMLAnchorElement>(
    'a[href^="/admin/player-prospects/"][href$="/communications"]',
  );
  const match = link?.getAttribute("href")?.match(
    /^\/admin\/player-prospects\/([^/]+)\/communications$/,
  );
  return match?.[1] ?? null;
}

function getProspectPoolPanel(article: HTMLElement) {
  const label = Array.from(article.querySelectorAll("div")).find(
    (node) => node.textContent?.trim() === "Prospect pool",
  );
  return label?.parentElement as HTMLElement | null;
}

function prospectHasEmail(article: HTMLElement) {
  return !Array.from(article.querySelectorAll("span")).some(
    (node) => node.textContent?.trim() === "No email",
  );
}

function isOpenUnassignedProspect(article: HTMLElement) {
  const text = article.textContent ?? "";
  return (
    text.includes("Unassigned prospect") &&
    !text.includes("Closed record") &&
    !text.includes("Active player reason:")
  );
}

function createStatusLine() {
  const status = document.createElement("p");
  status.className = "mt-2 text-xs leading-5 text-white/50";
  return status;
}

function formatPlayerPoolStatus(status: string) {
  switch (status) {
    case "INVITED":
      return "PlayerPool invite sent";
    case "AVAILABLE":
      return "In PlayerPool";
    case "INTRODUCTION_REQUESTED":
      return "PlayerPool introduction requested";
    case "TRIAL_ARRANGED":
      return "PlayerPool trial arranged";
    case "JOINED":
      return "Joined from PlayerPool";
    case "PAUSED":
      return "PlayerPool profile paused";
    case "NOT_LOOKING":
      return "Not looking in PlayerPool";
    default:
      return "In PlayerPool";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(parsed);
}

function addPlayerPoolBadge(article: HTMLElement, label: string) {
  const heading = article.querySelector("h3");
  const badgeRow = heading?.parentElement;
  if (!badgeRow) return;

  let badge = badgeRow.querySelector<HTMLElement>(
    '[data-player-pool-status-badge="true"]',
  );
  if (!badge) {
    badge = document.createElement("span");
    badge.dataset.playerPoolStatusBadge = "true";
    badge.className =
      "rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-100";
    badgeRow.appendChild(badge);
  }
  badge.textContent = label;
}

async function loadPlayerPoolState(prospectId: string) {
  const response = await fetch(
    `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/player-pool`,
    { cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as
    | PlayerPoolStatePayload
    | null;

  if (!response.ok) {
    throw new Error(payload?.error || "PlayerPool status could not be checked.");
  }

  return {
    inPlayerPool: Boolean(payload?.inPlayerPool),
    profile: payload?.profile ?? null,
  };
}

function injectPlayerPoolAction(article: HTMLElement) {
  if (article.dataset.playerPoolActionInjected === "true") return;
  if (!isOpenUnassignedProspect(article)) return;

  const prospectId = getProspectId(article);
  const panel = getProspectPoolPanel(article);
  if (!prospectId || !panel) return;

  article.dataset.playerPoolActionInjected = "true";

  const wrapper = document.createElement("div");
  wrapper.className =
    "mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] p-3";

  const description = document.createElement("p");
  description.className = "text-xs leading-5 text-emerald-50/70";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50";

  const status = createStatusLine();
  const hasEmail = prospectHasEmail(article);
  let existingProfile: PlayerPoolProfileState | null = null;

  const showNotInPlayerPool = () => {
    existingProfile = null;
    description.textContent =
      "Create a PlayerPool profile and email the player their private profile link.";

    if (!hasEmail) {
      button.disabled = true;
      button.textContent = "Email needed for PlayerPool";
      status.textContent = "Add an email address before sending this prospect.";
      status.className = "mt-2 text-xs leading-5 text-amber-100";
      return;
    }

    button.disabled = false;
    button.textContent = "Send to PlayerPool";
    status.textContent = "Not yet sent to PlayerPool.";
    status.className = "mt-2 text-xs leading-5 text-white/50";
  };

  const showExistingProfile = (profile: PlayerPoolProfileState) => {
    existingProfile = profile;
    const statusLabel = formatPlayerPoolStatus(profile.status);
    const dateLabel = formatDateTime(
      profile.profileSubmittedAt || profile.invitedAt || profile.updatedAt,
    );

    description.textContent =
      profile.profileSubmittedAt || profile.status === "AVAILABLE"
        ? "This player already has a completed PlayerPool profile."
        : "This player has already been sent to PlayerPool.";
    button.disabled = !hasEmail;
    button.textContent = hasEmail
      ? profile.status === "AVAILABLE"
        ? "Resend PlayerPool profile link"
        : "Resend PlayerPool invite"
      : "Email needed to resend invite";
    status.textContent = [
      statusLabel,
      profile.publicCode,
      dateLabel
        ? `${profile.profileSubmittedAt ? "profile completed" : "sent"} ${dateLabel}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    status.className = "mt-2 text-xs font-medium leading-5 text-emerald-200";
    addPlayerPoolBadge(article, statusLabel);
  };

  description.textContent = "Checking saved PlayerPool status…";
  button.disabled = true;
  button.textContent = "Checking PlayerPool…";
  status.textContent = "";

  button.addEventListener("click", async () => {
    if (!hasEmail) return;

    const wasAlreadyInPlayerPool = Boolean(existingProfile);
    button.disabled = true;
    button.textContent = wasAlreadyInPlayerPool
      ? "Resending PlayerPool invite…"
      : "Sending to PlayerPool…";
    status.textContent = wasAlreadyInPlayerPool
      ? "Queueing a fresh copy of the PlayerPool profile link."
      : "Creating the profile and queueing the invitation email.";
    status.className = "mt-2 text-xs leading-5 text-emerald-100/70";

    const leagueId = new URLSearchParams(window.location.search).get("leagueId");

    try {
      const response = await fetch(
        `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/player-pool`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leagueId: leagueId || null }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The player could not be sent to PlayerPool.");
      }

      const refreshed = await loadPlayerPoolState(prospectId);
      if (refreshed.profile) {
        showExistingProfile(refreshed.profile);
        if (payload?.message) {
          status.textContent = `${payload.message} ${status.textContent}`.trim();
        }
      } else {
        button.disabled = true;
        button.textContent = "Sent to PlayerPool";
        status.textContent =
          payload?.message || "PlayerPool profile invitation queued.";
        status.className = "mt-2 text-xs leading-5 text-emerald-200";
        addPlayerPoolBadge(article, "PlayerPool invite sent");
      }
    } catch (error) {
      if (existingProfile) {
        showExistingProfile(existingProfile);
      } else {
        showNotInPlayerPool();
      }
      status.textContent =
        error instanceof Error
          ? error.message
          : "The player could not be sent to PlayerPool.";
      status.className = "mt-2 text-xs leading-5 text-red-200";
    }
  });

  wrapper.append(description, button, status);
  panel.appendChild(wrapper);

  void loadPlayerPoolState(prospectId)
    .then((state) => {
      if (state.inPlayerPool && state.profile) {
        showExistingProfile(state.profile);
      } else {
        showNotInPlayerPool();
      }
    })
    .catch((error) => {
      showNotInPlayerPool();
      status.textContent =
        error instanceof Error
          ? error.message
          : "PlayerPool status could not be checked.";
      status.className = "mt-2 text-xs leading-5 text-amber-100";
    });
}

function injectAllPlayerPoolActions() {
  for (const article of document.querySelectorAll<HTMLElement>("article")) {
    injectPlayerPoolAction(article);
  }
}

export default function ProspectPlayerPoolBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/player-prospects") return;

    let frame = window.requestAnimationFrame(injectAllPlayerPoolActions);
    const timer = window.setTimeout(injectAllPlayerPoolActions, 500);
    const observer = new MutationObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(injectAllPlayerPoolActions);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
