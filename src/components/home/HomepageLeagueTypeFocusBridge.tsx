// ========================================
// File: src/components/home/HomepageLeagueTypeFocusBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const CURRENT_LABEL = "MEN’S LEAGUES";
const FUTURE_LABELS = new Set(["WOMEN’S LEAGUES", "YOUTH LEAGUES"]);

const TITLE_REPLACEMENTS = new Map([
  ["Harrogate Tuesday 6-a-side", "Harrogate West Tuesday League"],
  ["Wetherby Wednesday 6-a-side", "Wetherby Wednesday League"],
  ["Northallerton Wednesday 6-a-side", "Northallerton Wednesday League"],
]);

const HEARTLANDS_BODY =
  "A new SIXFL league for Bedale, Richmond and the surrounding area. Teams and individual players can view the details and register now.";
const UPDATED_HEARTLANDS_BODY =
  "A new SIXFL league for Bedale, Richmond, Thirsk, Catterick and the surrounding area. Teams and individual players can view the details and register now.";

function getOwnText(element: HTMLElement) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function findCardByTitle(...titles: string[]) {
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find(
    (item) => titles.includes(item.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );

  return heading?.closest<HTMLElement>("article") ?? null;
}

function updateLeagueCardActions() {
  const harrogateCard = findCardByTitle(
    "Harrogate West Tuesday League",
    "Harrogate Tuesday 6-a-side",
  );

  if (harrogateCard) {
    const links = Array.from(harrogateCard.querySelectorAll<HTMLAnchorElement>("a"));
    const playerLink = links[1];

    if (playerLink) {
      playerLink.textContent = "Join as player";
      playerLink.setAttribute(
        "href",
        "/register-interest?type=player&area=Harrogate&night=Tuesday",
      );
    }
  }

  const heartlandsCard = findCardByTitle("North Yorkshire Heartlands League");

  if (heartlandsCard) {
    const status = Array.from(heartlandsCard.querySelectorAll<HTMLElement>("div")).find(
      (item) => item.textContent?.replace(/\s+/g, " ").trim() === "New league forming",
    );

    if (status) status.textContent = "Registrations open";

    const links = Array.from(heartlandsCard.querySelectorAll<HTMLAnchorElement>("a"));
    const teamLink = links[0];
    const playerLink = links[1];

    if (teamLink) {
      teamLink.textContent = "Register team";
      teamLink.setAttribute("href", "/leagues/heartlands?type=team#register");
    }

    if (playerLink) {
      playerLink.textContent = "Join as player";
      playerLink.setAttribute("href", "/leagues/heartlands?type=player#register");
    }
  }
}

function updateHomepageCopy(pathname: string | null) {
  if (pathname !== "/") return;

  const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));

  for (const span of spans) {
    const ownText = getOwnText(span);

    if (FUTURE_LABELS.has(ownText)) {
      span.remove();
      continue;
    }

    if (ownText === CURRENT_LABEL) {
      for (const child of Array.from(span.children)) {
        if (child.textContent?.trim() === "•") child.remove();
      }
    }
  }

  for (const heading of document.querySelectorAll<HTMLHeadingElement>("h2")) {
    const currentTitle = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const replacement = TITLE_REPLACEMENTS.get(currentTitle);
    if (replacement) heading.textContent = replacement;
  }

  for (const paragraph of document.querySelectorAll<HTMLParagraphElement>("p")) {
    const currentBody = paragraph.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (currentBody === HEARTLANDS_BODY) {
      paragraph.textContent = UPDATED_HEARTLANDS_BODY;
    }
  }

  updateLeagueCardActions();
}

export default function HomepageLeagueTypeFocusBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const apply = () => updateHomepageCopy(pathname);
    const frame = window.requestAnimationFrame(apply);
    const timer = window.setTimeout(apply, 350);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
