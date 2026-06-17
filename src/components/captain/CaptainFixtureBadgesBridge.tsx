// ========================================
// File: src/components/captain/CaptainFixtureBadgesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type FixtureBadgeTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
};

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

type FixtureBadge = {
  id: string;
  homeTeam: FixtureBadgeTeam;
  awayTeam: FixtureBadgeTeam;
  fullLabel: string;
  captainLabel: string;
  winChance?: FixtureWinChance | null;
};

type FixtureBadgesPayload = {
  fixtures?: FixtureBadge[];
};

function getTeamInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function createBadge(team: FixtureBadgeTeam, size: "sm" | "lg") {
  const badge = document.createElement("span");
  badge.className = [
    "inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-black/35 shadow-[0_8px_24px_rgba(0,0,0,0.22)]",
    size === "lg" ? "h-14 w-14 rounded-2xl" : "h-9 w-9 rounded-xl",
  ].join(" ");
  badge.setAttribute("aria-label", `${team.name} badge`);

  if (team.logoUrl) {
    const image = document.createElement("img");
    image.src = team.logoUrl;
    image.alt = `${team.name} badge`;
    image.className = "h-full w-full object-cover";
    badge.appendChild(image);
  } else {
    const initials = document.createElement("span");
    initials.className =
      size === "lg"
        ? "text-sm font-black text-white/70"
        : "text-[11px] font-black text-white/70";
    initials.textContent = getTeamInitials(team.name);
    badge.appendChild(initials);
  }

  return badge;
}

function createTeamLabel(team: FixtureBadgeTeam, size: "sm" | "lg") {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-flex min-w-0 items-center gap-2";
  wrapper.dataset.fixtureBadgeInjected = "true";

  const name = document.createElement("span");
  name.className = "min-w-0";
  name.textContent = team.name;

  wrapper.appendChild(createBadge(team, size));
  wrapper.appendChild(name);

  return wrapper;
}

function createFullFixtureLabel(fixture: FixtureBadge, size: "sm" | "lg") {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2";
  wrapper.dataset.fixtureBadgeInjected = "true";

  const separator = document.createElement("span");
  separator.className = "text-white/55";
  separator.textContent = "vs";

  wrapper.appendChild(createTeamLabel(fixture.homeTeam, size));
  wrapper.appendChild(separator);
  wrapper.appendChild(createTeamLabel(fixture.awayTeam, size));

  return wrapper;
}

function createCaptainFixtureLabel(fixture: FixtureBadge, size: "sm" | "lg") {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2";
  wrapper.dataset.fixtureBadgeInjected = "true";

  const isHomeLabel = fixture.captainLabel === `vs ${fixture.awayTeam.name}`;
  const opponent = isHomeLabel ? fixture.awayTeam : fixture.homeTeam;

  const separator = document.createElement("span");
  separator.className = "text-white/55";
  separator.textContent = "vs";

  wrapper.appendChild(separator);
  wrapper.appendChild(createTeamLabel(opponent, size));

  return wrapper;
}

function getHighestChanceLabel(fixture: FixtureBadge) {
  const chance = fixture.winChance;
  if (!chance) return null;

  if (chance.home >= chance.draw && chance.home >= chance.away) {
    return `${fixture.homeTeam.name} ${chance.home}%`;
  }

  if (chance.away >= chance.home && chance.away >= chance.draw) {
    return `${fixture.awayTeam.name} ${chance.away}%`;
  }

  return `Draw ${chance.draw}%`;
}

function createCompactWinChanceBadge(fixture: FixtureBadge) {
  const chance = fixture.winChance;
  const highest = getHighestChanceLabel(fixture);

  if (!chance || !highest) return null;

  const badge = document.createElement("span");
  badge.dataset.fixtureWinChanceFor = fixture.id;
  badge.className =
    "inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100";
  badge.title = `${chance.aiPreview?.summary ?? chance.explanation} Predicted result ${chance.predictedResult.label} · Home ${chance.home}% · Draw ${chance.draw}% · Away ${chance.away}%`;
  badge.textContent = `SIXFL AI: ${chance.predictedResult.label} · ${highest}`;

  return badge;
}

function createPredictedResultCard(fixture: FixtureBadge) {
  const chance = fixture.winChance;
  if (!chance) return null;

  const card = document.createElement("div");
  card.className =
    "rounded-xl border border-emerald-400/20 bg-black/20 px-4 py-3 text-center";

  const label = document.createElement("div");
  label.className =
    "text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70";
  label.textContent = "Predicted result";

  const score = document.createElement("div");
  score.className = "mt-1 text-2xl font-black text-white";
  score.textContent = chance.predictedResult.label;

  card.appendChild(label);
  card.appendChild(score);

  return card;
}

function createAiPreview(fixture: FixtureBadge) {
  const preview = fixture.winChance?.aiPreview;
  if (!preview) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "mt-3 rounded-xl border border-white/10 bg-black/20 p-3";

  const headline = document.createElement("div");
  headline.className = "text-sm font-semibold text-white";
  headline.textContent = preview.headline;

  const summary = document.createElement("p");
  summary.className = "mt-2 text-xs leading-5 text-white/55";
  summary.textContent = preview.summary;

  wrapper.appendChild(headline);
  wrapper.appendChild(summary);

  return wrapper;
}

function createDetailedWinChanceBlock(fixture: FixtureBadge) {
  const chance = fixture.winChance;
  if (!chance) return null;

  const block = document.createElement("div");
  block.dataset.fixtureWinChanceFor = fixture.id;
  block.className =
    "mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";

  const headingWrap = document.createElement("div");

  const heading = document.createElement("div");
  heading.className =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300";
  heading.textContent = "SIXFL AI Predictor";

  const helperTop = document.createElement("div");
  helperTop.className = "mt-1 text-xs text-white/45";
  helperTop.textContent = `OpenAI match preview · ${chance.confidence} confidence · Just for fun`;

  headingWrap.appendChild(heading);
  headingWrap.appendChild(helperTop);
  header.appendChild(headingWrap);

  const predictedResultCard = createPredictedResultCard(fixture);
  if (predictedResultCard) header.appendChild(predictedResultCard);

  const aiPreview = createAiPreview(fixture);

  const grid = document.createElement("div");
  grid.className = "mt-3 grid gap-2 sm:grid-cols-3";

  const rows = [
    { label: fixture.homeTeam.name, value: chance.home, bar: "bg-emerald-400" },
    { label: "Draw", value: chance.draw, bar: "bg-white/45" },
    { label: fixture.awayTeam.name, value: chance.away, bar: "bg-sky-400" },
  ];

  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "rounded-xl border border-white/10 bg-black/20 p-3";

    const top = document.createElement("div");
    top.className = "flex items-center justify-between gap-2";

    const label = document.createElement("div");
    label.className = "truncate text-xs font-semibold text-white/75";
    label.textContent = row.label;
    label.title = row.label;

    const value = document.createElement("div");
    value.className = "text-base font-black text-white";
    value.textContent = `${row.value}%`;

    const rail = document.createElement("div");
    rail.className = "mt-2 h-1.5 overflow-hidden rounded-full bg-white/10";

    const bar = document.createElement("div");
    bar.className = `h-full rounded-full ${row.bar}`;
    bar.style.width = `${row.value}%`;

    top.appendChild(label);
    top.appendChild(value);
    rail.appendChild(bar);
    card.appendChild(top);
    card.appendChild(rail);
    grid.appendChild(card);
  }

  const helper = document.createElement("p");
  helper.className = "mt-3 text-xs leading-5 text-white/45";
  helper.textContent = chance.explanation;

  block.appendChild(header);
  if (aiPreview) block.appendChild(aiPreview);
  block.appendChild(grid);
  block.appendChild(helper);

  return block;
}

function findMatchingFixture(text: string, fixtures: FixtureBadge[]) {
  const normalisedText = text.replace(/\s+/g, " ").trim();

  return (
    fixtures.find((fixture) => {
      const fullLabel = fixture.fullLabel.replace(/\s+/g, " ").trim();
      const captainLabel = fixture.captainLabel.replace(/\s+/g, " ").trim();

      return normalisedText === fullLabel || normalisedText === captainLabel;
    }) ?? null
  );
}

function injectWinChance(element: HTMLElement, fixture: FixtureBadge) {
  if (!fixture.winChance) return;

  if (element.tagName === "H2") {
    const parent = element.parentElement;
    if (parent?.querySelector(`[data-fixture-win-chance-for="${fixture.id}"]`)) {
      return;
    }

    const block = createDetailedWinChanceBlock(fixture);
    if (block) element.insertAdjacentElement("afterend", block);
    return;
  }

  const target = element.parentElement ?? element;
  if (target.querySelector(`[data-fixture-win-chance-for="${fixture.id}"]`)) {
    return;
  }

  const badge = createCompactWinChanceBadge(fixture);
  if (badge) target.appendChild(badge);
}

function injectFixtureBadges(fixtures: FixtureBadge[]) {
  if (fixtures.length === 0) return;

  const headingCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "h2, div.text-base.font-semibold.text-white, div.font-semibold.text-white",
    ),
  );

  for (const element of headingCandidates) {
    if (element.dataset.fixtureBadgeProcessed === "true") {
      const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const fixture = findMatchingFixture(text, fixtures);
      if (fixture) injectWinChance(element, fixture);
      continue;
    }

    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text.includes(" vs ") && !text.startsWith("vs ")) continue;

    const fixture = findMatchingFixture(text, fixtures);
    if (!fixture) continue;

    const size = element.tagName === "H2" ? "lg" : "sm";
    element.textContent = "";
    element.classList.add("flex", "items-center", "gap-3");
    element.dataset.fixtureBadgeProcessed = "true";
    element.dataset.fixtureFullLabel = fixture.fullLabel;
    element.dataset.fixtureCaptainLabel = fixture.captainLabel;

    const label = text === fixture.fullLabel
      ? createFullFixtureLabel(fixture, size)
      : createCaptainFixtureLabel(fixture, size);

    element.appendChild(label);
    injectWinChance(element, fixture);
  }
}

async function loadFixtureBadges(teamId: string) {
  const response = await fetch(`/api/captain/team/${teamId}/fixture-badges`, {
    cache: "no-store",
  });

  if (!response.ok) return [];

  const payload = (await response.json().catch(() => null)) as FixtureBadgesPayload | null;
  return payload?.fixtures ?? [];
}

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export default function CaptainFixtureBadgesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);
    if (!teamId) return;
    if (!pathname.startsWith(`/captain/team/${teamId}`)) return;

    let cancelled = false;
    let fixtures: FixtureBadge[] = [];

    void loadFixtureBadges(teamId).then((loadedFixtures) => {
      if (cancelled) return;
      fixtures = loadedFixtures;
      injectFixtureBadges(fixtures);
    });

    const observer = new MutationObserver(() => {
      if (fixtures.length > 0) {
        injectFixtureBadges(fixtures);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
