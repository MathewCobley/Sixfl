// ========================================
// File: src/components/admin/player-prospects/ProspectPlayerPoolBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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
  description.textContent =
    "Create a PlayerPool profile and email the player their private profile link.";

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "mt-3 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50";

  const status = createStatusLine();
  const hasEmail = prospectHasEmail(article);

  if (!hasEmail) {
    button.disabled = true;
    button.textContent = "Email needed for PlayerPool";
    status.textContent = "Add an email address before sending this prospect.";
  } else {
    button.textContent = "Send to PlayerPool";
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Sending to PlayerPool…";
    status.textContent = "Creating the profile and queueing the invitation email.";
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

      button.textContent = "Sent to PlayerPool";
      status.textContent =
        payload?.message || "PlayerPool profile invitation queued.";
      status.className = "mt-2 text-xs leading-5 text-emerald-200";
    } catch (error) {
      button.disabled = false;
      button.textContent = "Send to PlayerPool";
      status.textContent =
        error instanceof Error
          ? error.message
          : "The player could not be sent to PlayerPool.";
      status.className = "mt-2 text-xs leading-5 text-red-200";
    }
  });

  wrapper.append(description, button, status);
  panel.appendChild(wrapper);
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
