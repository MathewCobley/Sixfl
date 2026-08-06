"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamId(pathname: string) {
  return pathname.match(/^\/player\/team\/([^/]+)/)?.[1] ?? null;
}

function ensureButton(label: string, href: string, container: Element, kind: string) {
  const existing = document.querySelector<HTMLAnchorElement>(
    `[data-captain-player-mode-switch="${kind}"]`,
  );
  if (existing) return true;

  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  link.dataset.captainPlayerModeSwitch = kind;
  link.className =
    kind === "dashboard"
      ? "inline-flex items-center rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/[0.1]"
      : "inline-flex items-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/15";
  container.appendChild(link);
  return true;
}

function findPlayerActionArea() {
  const main = document.querySelector("main");
  const firstSection = main?.querySelector("section");
  if (!firstSection) return null;

  const availabilityLink = firstSection.querySelector<HTMLAnchorElement>(
    'a[href*="/availability"]',
  );
  if (availabilityLink?.parentElement) return availabilityLink.parentElement;

  return (
    Array.from(firstSection.querySelectorAll("div")).find((element) => {
      const text = element.textContent ?? "";
      return text.includes("Confirm availability") || text.includes("View league");
    }) ?? firstSection
  );
}

function pageShowsCaptainAccess() {
  const main = document.querySelector("main");
  if (!main) return false;

  return Array.from(main.querySelectorAll("span, p, div")).some((element) => {
    const text = element.textContent?.trim().toLowerCase() ?? "";
    return text === "captain" || text.endsWith("· captain");
  });
}

function correctCaptainWording() {
  const main = document.querySelector("main");
  if (!main) return;

  const teamAreaCopy = Array.from(main.querySelectorAll("p")).find((paragraph) =>
    paragraph.textContent?.includes("You’re linked to this SIXFL squad"),
  );
  if (teamAreaCopy) {
    teamAreaCopy.textContent =
      "This is your player view for this SIXFL squad. Use it to confirm your own availability, view your match fees and see player statistics.";
  }

  for (const element of Array.from(main.querySelectorAll("div, p, span"))) {
    const text = element.textContent ?? "";
    if (!text.includes("Your captain has") || !text.includes("left to rate")) continue;

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent) continue;
      node.textContent = node.textContent
        .replace(
          /Your captain has\s+(\d+)\s+performances?/i,
          "You have $1 player performances",
        )
        .replace(
          /Give them a gentle nudge[^.]*\.?/i,
          "Complete the outstanding ratings from your captain dashboard.",
        );
    }
  }
}

export default function CaptainPlayerModeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    let cancelled = false;
    let attempt = 0;
    let timer: number | null = null;

    const apply = () => {
      if (cancelled) return;
      attempt += 1;

      let complete = false;
      const actionArea = findPlayerActionArea();
      if (actionArea) {
        ensureButton("Back to dashboard", "/dashboard", actionArea, "dashboard");

        if (pageShowsCaptainAccess()) {
          correctCaptainWording();
          ensureButton(
            "Open captain dashboard",
            `/captain/team/${teamId}`,
            actionArea,
            "captain",
          );
        }
        complete = true;
      }

      if (!complete && attempt < 20) {
        timer = window.setTimeout(apply, 150);
      }
    };

    timer = window.setTimeout(apply, 0);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document
        .querySelectorAll<HTMLElement>("[data-captain-player-mode-switch]")
        .forEach((element) => element.remove());
    };
  }, [pathname]);

  return null;
}
