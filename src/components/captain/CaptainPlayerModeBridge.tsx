"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getTeamId(pathname: string) {
  return pathname.match(/^\/(?:captain|player)\/team\/([^/]+)/)?.[1] ?? null;
}

function makeButton(label: string, href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  link.dataset.captainPlayerModeSwitch = "true";
  link.className =
    "inline-flex items-center rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/15";
  return link;
}

function findActionArea() {
  const main = document.querySelector("main");
  const firstSection = main?.querySelector("section");
  if (!firstSection) return null;

  const candidates = Array.from(firstSection.querySelectorAll("div"));
  return (
    candidates.find((element) => {
      const text = element.textContent ?? "";
      return text.includes("Confirm availability") && text.includes("View league");
    }) ?? null
  );
}

function isCaptainPlayerPage() {
  const main = document.querySelector("main");
  const firstSection = main?.querySelector("section");
  if (!firstSection) return false;

  return Array.from(firstSection.querySelectorAll("span")).some(
    (span) => span.textContent?.trim().toLowerCase() === "captain",
  );
}

function correctCaptainWording() {
  const main = document.querySelector("main");
  if (!main) return;

  const paragraphs = Array.from(main.querySelectorAll("p"));
  const teamAreaCopy = paragraphs.find((paragraph) =>
    paragraph.textContent?.includes("You’re linked to this SIXFL squad"),
  );
  if (teamAreaCopy) {
    teamAreaCopy.textContent =
      "This is your player view for this SIXFL squad. Use it to confirm your own availability, view your match fees and see player statistics.";
  }

  const elements = Array.from(main.querySelectorAll("div, p, span"));
  for (const element of elements) {
    const text = element.textContent ?? "";
    if (!text.includes("Your captain has") || !text.includes("left to rate")) continue;

    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent) continue;
      node.textContent = node.textContent
        .replace(/Your captain has\s+(\d+)\s+performances?/i, "You have $1 player performances")
        .replace(/Give them a gentle nudge[^.]*\.?/i, "Complete the outstanding ratings from your captain dashboard.");
    }
  }
}

export default function CaptainPlayerModeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    const apply = () => {
      document
        .querySelectorAll<HTMLElement>('[data-captain-player-mode-switch="true"]')
        .forEach((element) => element.remove());

      if (pathname.startsWith(`/player/team/${teamId}`) && isCaptainPlayerPage()) {
        correctCaptainWording();
        const actionArea = findActionArea();
        if (actionArea) {
          actionArea.appendChild(
            makeButton("Switch to captain dashboard", `/captain/team/${teamId}`),
          );
        }
        return;
      }

      if (pathname.startsWith(`/captain/team/${teamId}`)) {
        const main = document.querySelector("main");
        const firstSection = main?.querySelector("section");
        if (!firstSection) return;

        const actionArea =
          Array.from(firstSection.querySelectorAll("div")).find(
            (element) => element.querySelectorAll("a").length > 0,
          ) ?? firstSection;
        actionArea.appendChild(
          makeButton("View my player page", `/player/team/${teamId}`),
        );
      }
    };

    const timer = window.setTimeout(apply, 0);
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document
        .querySelectorAll<HTMLElement>('[data-captain-player-mode-switch="true"]')
        .forEach((element) => element.remove());
    };
  }, [pathname]);

  return null;
}
