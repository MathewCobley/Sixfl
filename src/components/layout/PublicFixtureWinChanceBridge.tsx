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

const PREDICTION_SECTION_SELECTOR = "[data-public-fixture-win-chance-section='1']";

function getLeagueSlugFromPathname(pathname: string) {
  const match = pathname.match(/^\/leagues\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
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

function formatKickoff(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

function createAiPreviewBlock(aiPreview?: FixtureAiPreview) {
  if (!aiPreview?.headline?.trim() && !aiPreview?.summary?.trim()) return null;

  const block = document.createElement("div");
  block.className = "mt-4 rounded-2xl border border-white/10 bg-black/20 p-4";

  if (aiPreview.headline?.trim()) {
    const headline = document.createElement("div");
    headline.className = "text-sm font-semibold text-white";
    headline.textContent = aiPreview.headline.trim();
    block.appendChild(headline);
  }

  if (aiPreview.summary?.trim()) {
    const summary = document.createElement("p");
    summary.className = "mt-2 text-sm leading-6 text-white/60";
    summary.textContent = aiPreview.summary.trim();
    block.appendChild(summary);
  }

  return block;
}

function createWinChanceBlock(fixture: FixtureWinChanceItem) {
  const block = document.createElement("article");
  block.dataset.publicFixtureWinChance = fixture.id;
  block.className =
    "rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)] sm:p-5";

  const matchup = document.createElement("div");
  matchup.className = "mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-white";
  matchup.textContent = `${fixture.homeTeamName} v ${fixture.awayTeamName}`;

  const kickoff = formatKickoff(fixture.kickoffAt);
  if (kickoff) {
    const kickoffPill = document.createElement("span");
    kickoffPill.className =
      "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/55";
    kickoffPill.textContent = kickoff;
    matchup.appendChild(kickoffPill);
  }

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

  const aiPreview = createAiPreviewBlock(fixture.winChance.aiPreview);

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

  block.appendChild(matchup);
  block.appendChild(header);
  if (aiPreview) block.appendChild(aiPreview);
  block.appendChild(grid);
  block.appendChild(explanation);

  return block;
}

function findUpcomingFixturesSection() {
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find((item) => {
    const text = item.textContent?.toLowerCase() ?? "";
    return text.includes("upcoming") && text.includes("fixture");
  });

  return heading?.closest(".rounded-3xl") as HTMLElement | null;
}

function createPredictionSection(fixtures: FixtureWinChanceItem[]) {
  const section = document.createElement("section");
  section.dataset.publicFixtureWinChanceSection = "1";
  section.className =
    "rounded-3xl border border-emerald-400/15 bg-white/[0.03] p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-8";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between";
  header.innerHTML = `
    <div>
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">SIXFL AI Predictor</p>
      <h2 class="mt-3 text-2xl font-bold sm:text-3xl">Match predictions</h2>
      <p class="mt-3 max-w-2xl text-sm leading-6 text-white/60">All AI match previews are grouped here so the fixture list and results stay separate.</p>
    </div>
    <div class="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">${fixtures.length} prediction${fixtures.length === 1 ? "" : "s"}</div>
  `;

  const list = document.createElement("div");
  list.className = "mt-8 space-y-4";
  fixtures.forEach((fixture) => list.appendChild(createWinChanceBlock(fixture)));

  section.appendChild(header);
  section.appendChild(list);

  return section;
}

function removeOldPredictionBlocks() {
  document
    .querySelectorAll<HTMLElement>("[data-public-fixture-win-chance]")
    .forEach((node) => node.remove());
  document
    .querySelectorAll<HTMLElement>(PREDICTION_SECTION_SELECTOR)
    .forEach((node) => node.remove());
}

function injectWinChances(fixtures: FixtureWinChanceItem[]) {
  if (fixtures.length === 0) return;
  if (document.querySelector(PREDICTION_SECTION_SELECTOR)) return;

  const fixturesSection = findUpcomingFixturesSection();
  if (!fixturesSection?.parentElement) return;

  removeOldPredictionBlocks();
  fixturesSection.insertAdjacentElement("beforebegin", createPredictionSection(fixtures));
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

    removeOldPredictionBlocks();

    void loadWinChances(slug).then((loadedFixtures) => {
      if (cancelled) return;
      fixtures = loadedFixtures;
      injectWinChances(fixtures);
    });

    const observer = new MutationObserver(() => {
      if (fixtures.length > 0) injectWinChances(fixtures);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
