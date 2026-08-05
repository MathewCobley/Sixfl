"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getLeagueId(pathname: string) {
  return /^\/admin\/leagues\/([^/]+)(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

function getCaptainTeamId(pathname: string) {
  return /^\/captain\/team\/([^/]+)(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

async function installAdminToggle(leagueId: string, signal: AbortSignal) {
  if (document.querySelector("[data-league-free-kit-toggle]")) return true;

  const response = await fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/free-kit-offer`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { enabled: boolean; name: string };

  const heading = document.querySelector("main h1") ?? document.querySelector("h1");
  const host = heading?.parentElement;
  if (!host) return false;

  const card = document.createElement("section");
  card.dataset.leagueFreeKitToggle = "true";
  card.className = "mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4";

  const row = document.createElement("label");
  row.className = "flex cursor-pointer items-start justify-between gap-4";

  const copy = document.createElement("div");
  const title = document.createElement("div");
  title.className = "font-semibold text-white";
  title.textContent = "Free kit offer available";
  const text = document.createElement("p");
  text.className = "mt-1 text-sm leading-5 text-white/55";
  text.textContent = "Turn this off when new teams in this league should no longer be offered the free seven-kit package. Existing submitted kit orders remain available.";
  const status = document.createElement("p");
  status.className = "mt-2 text-xs font-semibold text-emerald-100/70";
  copy.append(title, text, status);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(data.enabled);
  input.className = "mt-1 h-5 w-5 accent-emerald-400";

  const refreshStatus = () => {
    status.textContent = input.checked
      ? "ON — new teams can receive the free kit offer"
      : "OFF — new teams will only see paid kit options";
  };
  refreshStatus();

  input.addEventListener("change", async () => {
    input.disabled = true;
    status.textContent = "Saving…";
    const save = await fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/free-kit-offer`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: input.checked }),
    });
    if (!save.ok) {
      input.checked = !input.checked;
      status.textContent = "Could not save. Please try again.";
    } else {
      refreshStatus();
    }
    input.disabled = false;
  });

  row.append(copy, input);
  card.appendChild(row);
  host.appendChild(card);
  return true;
}

function hideFreeOfferCopy() {
  const phrases = [
    "free team kit offer",
    "free kit allocation",
    "complete kits free of charge",
    "seven complete personalised kits free",
    "free kits",
  ];

  for (const element of Array.from(document.querySelectorAll<HTMLElement>("section, article, div, a"))) {
    const text = element.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
    if (!phrases.some((phrase) => text.includes(phrase))) continue;
    if (element.querySelector("input, select, textarea")) continue;
    element.style.display = "none";
  }
}

async function applyCaptainOffer(teamId: string, signal: AbortSignal) {
  const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/kit-offer-status`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { offerAvailable: boolean; existingEntitlement: boolean };
  if (data.offerAvailable) return true;

  hideFreeOfferCopy();

  if (/\/kit(?:\/|$)/.test(window.location.pathname) && !document.querySelector("[data-paid-kit-only-notice]")) {
    const heading = document.querySelector("main h1") ?? document.querySelector("h1");
    const host = heading?.closest("section")?.parentElement ?? heading?.parentElement;
    if (host) {
      const notice = document.createElement("section");
      notice.dataset.paidKitOnlyNotice = "true";
      notice.className = "rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] p-5 text-white";
      notice.innerHTML = '<h2 class="text-lg font-semibold">Team kit orders</h2><p class="mt-2 text-sm leading-6 text-white/60">The free kit offer has ended for this league. Complete additional kits remain available at the standard paid price.</p>';
      host.insertBefore(notice, host.children[1] ?? null);
    }
  }
  return true;
}

export default function LeagueFreeKitOfferBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const leagueId = getLeagueId(pathname);
    const teamId = getCaptainTeamId(pathname);
    if (!leagueId && !teamId) return;

    const controller = new AbortController();
    let stopped = false;
    let attempts = 0;
    let timer: number | null = null;

    const install = async () => {
      if (stopped) return;
      attempts += 1;
      let complete = false;
      try {
        complete = leagueId
          ? await installAdminToggle(leagueId, controller.signal)
          : teamId
            ? await applyCaptainOffer(teamId, controller.signal)
            : true;
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      }
      if (!complete && attempts < 20) timer = window.setTimeout(() => void install(), 150);
    };

    timer = window.setTimeout(() => void install(), 0);
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.querySelectorAll<HTMLElement>("[data-league-free-kit-toggle], [data-paid-kit-only-notice]").forEach((node) => node.remove());
    };
  }, [pathname]);

  return null;
}
