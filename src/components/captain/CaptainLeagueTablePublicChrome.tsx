// ========================================
// File: src/components/captain/CaptainLeagueTablePublicChrome.tsx
// ========================================

"use client";

import { useEffect } from "react";

const WIDE_TABLE_GRID =
  "grid-cols-[72px_minmax(280px,2fr)_170px_72px_72px_72px_72px_84px_84px_84px_92px]";

const FIT_TABLE_GRID =
  "grid-cols-[52px_minmax(170px,1.8fr)_112px_repeat(4,44px)_repeat(3,52px)_58px] xl:grid-cols-[56px_minmax(210px,2fr)_130px_repeat(4,50px)_repeat(3,60px)_64px]";

function replaceClassToken(element: HTMLElement, from: string, to: string) {
  if (element.className.includes(to)) return;
  element.className = element.className.replaceAll(from, to);
}

function ensureClassToken(element: HTMLElement, token: string) {
  if (!element.className.includes(token)) {
    element.className = `${element.className} ${token}`.trim();
  }
}

function getPublicTableTitle(rawLeagueText: string) {
  const compactLeagueText = rawLeagueText.replace(/·/g, " ").replace(/\s+/g, " ").trim();
  const harrogateWestMatch = compactLeagueText.match(/Harrogate\s+West/i);

  if (harrogateWestMatch) {
    return "Current Harrogate West 6 a side table";
  }

  const beforeSeason = compactLeagueText.split(/Spring|Summer|Autumn|Winter|Season/i)[0]?.trim();
  const cleaned = beforeSeason
    ?.replace(/^SIXFL\s+/i, "")
    .replace(/\bMens\b/i, "")
    .replace(/\bWomens\b/i, "")
    .replace(/\bLeague\b/gi, "")
    .replace(/\bTuesday\b|\bWednesday\b|\bThursday\b|\bMonday\b|\bFriday\b|\bSaturday\b|\bSunday\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `Current ${cleaned} 6 a side table` : "Current league table";
}

function normalisePositionBadge(element: HTMLElement, isTopRow: boolean) {
  if (isTopRow) {
    ensureClassToken(element, "border-emerald-400/30");
    ensureClassToken(element, "bg-emerald-500/10");
    ensureClassToken(element, "text-emerald-300");
    return;
  }

  replaceClassToken(element, "border-emerald-400/30", "border-white/10");
  replaceClassToken(element, "bg-emerald-500/10", "bg-white/[0.04]");
  replaceClassToken(element, "text-emerald-300", "text-white/70");
  ensureClassToken(element, "border-white/10");
  ensureClassToken(element, "bg-white/[0.04]");
  ensureClassToken(element, "text-white/70");
}

function fitCaptainLeagueTableToDashboard(table: HTMLElement) {
  const desktopScrollWrapper = table.querySelector(".lg\\:overflow-x-auto") as HTMLElement | null;
  const desktopWidthWrapper = table.querySelector(".lg\\:min-w-\\[1240px\\]") as HTMLElement | null;

  if (desktopScrollWrapper) {
    replaceClassToken(desktopScrollWrapper, "lg:overflow-x-auto", "w-full overflow-hidden");
    ensureClassToken(desktopScrollWrapper, "w-full");
    ensureClassToken(desktopScrollWrapper, "overflow-hidden");
  }

  if (desktopWidthWrapper) {
    replaceClassToken(desktopWidthWrapper, "lg:min-w-[1240px]", "w-full");
    ensureClassToken(desktopWidthWrapper, "w-full");
  }

  Array.from(table.querySelectorAll<HTMLElement>(".lg\\:grid")).forEach((grid) => {
    replaceClassToken(grid, WIDE_TABLE_GRID, FIT_TABLE_GRID);
    replaceClassToken(grid, "gap-4", "gap-3");
  });

  const desktopHeader = table.querySelector<HTMLElement>(".bg-white\\/\\[0\\.02\\]");
  if (desktopHeader) {
    replaceClassToken(desktopHeader, "px-8", "px-5 xl:px-6");
    replaceClassToken(desktopHeader, "text-xs", "text-[10px]");
    replaceClassToken(desktopHeader, "tracking-[0.18em]", "tracking-[0.16em]");
  }

  Array.from(table.querySelectorAll<HTMLElement>(".divide-y > div")).forEach((row) => {
    replaceClassToken(row, "py-5", "py-4");
    replaceClassToken(row, "lg:px-8", "lg:px-5 xl:px-6");
  });

  Array.from(table.querySelectorAll<HTMLImageElement>("img[sizes='56px']")).forEach((image) => {
    image.sizes = "44px";
    replaceClassToken(image, "p-2", "p-1.5");
  });
}

function applyPublicLeagueTableChrome() {
  const table = document.getElementById("captain-league-table") as HTMLElement | null;
  if (!table || table.dataset.publicChromeApplied === "true") return;

  table.dataset.publicChromeApplied = "true";
  replaceClassToken(table, "bg-white/[0.04]", "bg-white/[0.03]");
  ensureClassToken(table, "bg-white/[0.03]");
  fitCaptainLeagueTableToDashboard(table);

  const header = table.firstElementChild as HTMLElement | null;
  const headerTextBlock = header?.firstElementChild as HTMLElement | null;
  const leagueDescription = headerTextBlock?.querySelector("p.mt-2.text-sm") as HTMLElement | null;
  const rawLeagueText = leagueDescription?.textContent?.trim() ?? "";
  const title = headerTextBlock?.querySelector("h2") as HTMLElement | null;
  const eyebrow = headerTextBlock?.querySelector("p") as HTMLElement | null;
  const headerPills = header?.lastElementChild as HTMLElement | null;

  if (eyebrow) {
    eyebrow.className = "text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400";
  }

  if (title) {
    title.className = "mt-3 text-2xl font-bold text-white sm:text-3xl";
    title.textContent = getPublicTableTitle(rawLeagueText);
  }

  if (leagueDescription) {
    leagueDescription.className = "mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base";
    const titleText = title?.textContent ?? "this league table";
    const location = titleText.replace(/^Current\s+/i, "").replace(/\s+6 a side table$/i, "");
    leagueDescription.textContent = `Follow the latest standings, points, goal difference and recent form in this ${location} 6 a side football league.`;
  }

  if (headerPills && headerPills !== headerTextBlock) {
    headerPills.remove();
  }

  const body = Array.from(table.querySelectorAll("div.divide-y")).find((node) =>
    (node as HTMLElement).className.includes("divide-white/10"),
  ) as HTMLElement | undefined;

  if (!body) return;

  Array.from(body.children).forEach((child, index) => {
    const row = child as HTMLElement;
    replaceClassToken(row, "bg-emerald-500/10", "bg-black/20");
    replaceClassToken(row, "bg-white/[0.04]", "bg-black/20");
    ensureClassToken(row, "bg-black/20");

    Array.from(row.querySelectorAll("span")).forEach((span) => {
      if (span.textContent?.trim().toLowerCase() === "your team") {
        span.remove();
      }
    });

    Array.from(row.querySelectorAll("div")).forEach((div) => {
      const element = div as HTMLElement;
      if (
        element.textContent?.trim() === String(index + 1) &&
        element.className.includes("font-black") &&
        element.className.includes("border")
      ) {
        normalisePositionBadge(element, index === 0);
      }
    });
  });
}

export default function CaptainLeagueTablePublicChrome() {
  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(applyPublicLeagueTableChrome);

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return null;
}
