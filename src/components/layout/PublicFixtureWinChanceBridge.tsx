// ========================================
// File: src/components/layout/PublicFixtureWinChanceBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type FixtureAiPreview = {
  headline: string;
  summary: string;
  source: "openai" | "fallback";
};

type FixtureWinChance = {
  home: number;
  draw: number;
  away: number;
  predictedResult: {
    homeScore: number;
    awayScore: number;
    label: string;
  };
  aiPreview?: FixtureAiPreview;
  confidence: "Low" | "Medium" | "High";
  explanation: string;
};

type FixtureWinChanceItem = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  fullLabel: string;
  kickoffAt: string;
  winChance: FixtureWinChance;
};

type WinChancePayload = {
  fixtures?: FixtureWinChanceItem[];
};

function getLeagueSlugFromPathname(pathname: string) {
  const match = pathname.match(/^\/leagues\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normaliseText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getBarClass(type: "home" | "draw" | "away") {
  switch (type) {
    case "home":
      return "bg-emerald-400";
    case "away":
      return "bg-sky-400";
    default:
      return "bg-white/45";
  }
}

function hasFixtureText(
  element: HTMLElement,
  fixture: FixtureWinChanceItem,
) {
  const text = normaliseText(element.textContent ?? "");
  return (
    text.includes(normaliseText(fixture.homeTeamName)) &&
    text.includes(normaliseText(fixture.awayTeamName))
  );
}

function countVsLabels(element: HTMLElement) {
  const text = normaliseText(element.textContent ?? "");
  return text.match(/\bvs\b/g)?.length ?? 0;
}

function getElementClassName(element: HTMLElement) {
  return element.getAttribute("class") ?? "";
}

function isLikelyFixtureCard(element: HTMLElement) {
  const className = getElementClassName(element);

  return (
    className.includes("rounded-") &&
    className.includes("border") &&
    !className.includes("grid-cols")
  );
}

function getFixtureCardScore(element: HTMLElement) {
  const text = normaliseText(element.textContent ?? "");
  const className = getElementClassName(element);
  const width = element.getBoundingClientRect().width;
  const vsCount = countVsLabels(element);

  let score = 0;

  if (isLikelyFixtureCard(element)) score += 60;
  if (vsCount === 1) score += 45;
  if (width >= 560) score += 35;
  if (width >= 420) score += 20;
  if (className.includes("p-4") || className.includes("p-5")) score += 10;
  if (text.length < 420) score += 25;
  if (text.length > 900) score -= 80;
  if (text.includes("upcoming fixtures")) score -= 60;
  if (text.includes("results")) score -= 35;

  return score;
}

function findFixtureCard(fixture: FixtureWinChanceItem) {
  const matchingElements = Array.from(
    document.querySelectorAll<HTMLElement>("article, div"),
  ).filter((element) => {
    if (!hasFixtureText(element, fixture)) return false;
    if (normaliseText(element.textContent ?? "").includes("sixfl ai predictor")) return false;
    if (element.querySelector(`[data-public-fixture-win-chance="${fixture.id}"]`)) {
      return false;
    }

    return true;
  });

  const candidates = new Set<HTMLElement>();

  for (const element of matchingElements) {
    let current: HTMLElement | null = element;
    let depth = 0;

    while (current && depth < 8) {
      if (!hasFixtureText(current, fixture)) break;

      if (isLikelyFixtureCard(current) || countVsLabels(current) === 1) {
        candidates.add(current);
      }

      current = current.parentElement;
      depth += 1;
    }
  }

  return (
    Array.from(candidates)
      .sort((a, b) => {
        const scoreDifference = getFixtureCardScore(b) - getFixtureCardScore(a);
        if (scoreDifference !== 0) return scoreDifference;

        const widthDifference = b.getBoundingClientRect().width - a.getBoundingClientRect().width;
        if (widthDifference !== 0) return widthDifference;

        return (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0);
      })[0] ?? null
  );
}

function createChanceCard(input: {
  label: string;
  value: number;
  type: "home" | "draw" | "away";
}) {
  const card = document.createElement("div");
  card.className = "min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3";

  const top = document.createElement("div");
  top.className = "flex items-start justify-between gap-3";

  const label = document.createElement("div");
  label.className = "min-w-0 text-xs font-semibold leading-4 text-white/75";
  label.textContent = input.label;
  label.title = input.label;

  const value = document.createElement("div");
  value.className = "shrink-0 text-lg font-black text-white";
  value.textContent = `${input.value}%`;

  const rail = document.createElement("div");
  rail.className = "mt-3 h-1.5 overflow-hidden rounded-full bg-white/10";

  const bar = document.createElement("div");
  bar.className = `h-full rounded-full ${getBarClass(input.type)}`;
  bar.style.width = `${input.value}%`;

  top.appendChild(label);
  top.appendChild(value);
  rail.appendChild(bar);
  card.appendChild(top);
  card.appendChild(rail);

  return card;
}

function createPredictedResultCard(fixture: FixtureWinChanceItem) {
  const card = document.createElement("div");
  card.className =
    "rounded-2xl border border-emerald-400/20 bg-black/25 px-5 py-3 text-center";

  const label = document.createElement("div");
  label.className =
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70";
  label.textContent = "Predicted result";

  const score = document.createElement("div");
  score.className = "mt-1 text-3xl font-black text-white";
  score.textContent = fixture.winChance.predictedResult.label;

  card.appendChild(label);
  card.appendChild(score);

  return card;
}

function createWinChanceBlock(fixture: FixtureWinChanceItem) {
  const block = document.createElement("div");
  block.dataset.publicFixtureWinChance = fixture.id;
  block.className =
    "mt-5 w-full rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)] sm:p-5";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between";

  const headingWrap = document.createElement("div");

  const eyebrow = document.createElement("div");
  eyebrow.className =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300";
  eyebrow.textContent = "SIXFL AI Predictor";

  const helper = document.createElement("div");
  helper.className = "mt-1 text-xs text-white/45";
  helper.textContent = `Match preview · ${fixture.winChance.confidence} confidence · Just for fun`;

  headingWrap.appendChild(eyebrow);
  headingWrap.appendChild(helper);

  header.appendChild(headingWrap);
  header.appendChild(createPredictedResultCard(fixture));

  const grid = document.createElement("div");
  grid.className = "mt-4 grid w-full gap-3 sm:grid-cols-3";
  grid.appendChild(
    createChanceCard({
      label: fixture.homeTeamName,
      value: fixture.winChance.home,
      type: "home",
    }),
  );
  grid.appendChild(
    createChanceCard({
      label: "Draw",
      value: fixture.winChance.draw,
      type: "draw",
    }),
  );
  grid.appendChild(
    createChanceCard({
      label: fixture.awayTeamName,
      value: fixture.winChance.away,
      type: "away",
    }),
  );

  const explanation = document.createElement("p");
  explanation.className = "mt-3 text-xs leading-5 text-white/45";
  explanation.textContent = fixture.winChance.explanation;

  block.appendChild(header);
  block.appendChild(grid);
  block.appendChild(explanation);

  return block;
}

function injectWinChances(fixtures: FixtureWinChanceItem[]) {
  for (const fixture of fixtures) {
    if (document.querySelector(`[data-public-fixture-win-chance="${fixture.id}"]`)) {
      continue;
    }

    const card = findFixtureCard(fixture);
    if (!card) continue;

    card.classList.add("w-full");
    card.appendChild(createWinChanceBlock(fixture));
  }
}

async function loadWinChances(slug: string) {
  const response = await fetch(`/api/leagues/${encodeURIComponent(slug)}/win-chances`, {
    cache: "no-store",
  });

  if (!response.ok) return [];

  const payload = (await response.json().catch(() => null)) as WinChancePayload | null;
  return payload?.fixtures ?? [];
}

export default function PublicFixtureWinChanceBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const slug = getLeagueSlugFromPathname(pathname);
    if (!slug) return;

    let cancelled = false;
    let fixtures: FixtureWinChanceItem[] = [];

    void loadWinChances(slug).then((loadedFixtures) => {
      if (cancelled) return;
      fixtures = loadedFixtures;
      injectWinChances(fixtures);
    });

    const observer = new MutationObserver(() => {
      if (fixtures.length > 0) {
        injectWinChances(fixtures);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
