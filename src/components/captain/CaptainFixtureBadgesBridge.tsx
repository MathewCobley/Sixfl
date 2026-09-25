// ========================================
// File: src/components/captain/CaptainFixtureBadgesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import CaptainCurrentLeagueTableBridge from "@/components/captain/CaptainCurrentLeagueTableBridge";

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
  aiPreview?: FixtureAiPreview | null;
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

function createChanceCard(input: {
  label: string;
  value: number;
  type: "home" | "draw" | "away";
}) {
  const card = document.createElement("div");
  card.className = "min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3";

  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-2";

  const label = document.createElement("div");
  label.className = "truncate text-xs font-semibold text-white/80";
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

  row.appendChild(label);
  row.appendChild(value);
  rail.appendChild(bar);
  card.appendChild(row);
  card.appendChild(rail);

  return card;
}

function createFullWinChancePanel(fixture: FixtureBadge) {
  const chance = fixture.winChance;
  if (!chance) return null;

  const wrapper = document.createElement("details");
  wrapper.open = true;
  wrapper.dataset.fixtureFullAiFor = fixture.id;
  wrapper.className =
    "mt-3 w-full rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)]";

  const summary = document.createElement("summary");
  summary.className = "cursor-pointer list-none";

  const summaryInner = document.createElement("div");
  summaryInner.className = "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";

  const left = document.createElement("div");

  const eyebrow = document.createElement("div");
  eyebrow.className = "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300";
  eyebrow.textContent = "SIXFL AI Predictor";

  const helper = document.createElement("div");
  helper.className = "mt-1 text-xs text-white/45";
  helper.textContent = `${chance.confidence} confidence · Just for fun · Match preview below`;

  left.appendChild(eyebrow);
  left.appendChild(helper);

  const score = document.createElement("div");
  score.className = "rounded-2xl border border-emerald-400/20 bg-black/25 px-5 py-3 text-center";
  score.innerHTML = `
    <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">Predicted result</div>
    <div class="mt-1 text-3xl font-black text-white">${chance.predictedResult.label}</div>
  `;

  summaryInner.appendChild(left);
  summaryInner.appendChild(score);
  summary.appendChild(summaryInner);
  wrapper.appendChild(summary);

  if (chance.aiPreview) {
    const preview = document.createElement("div");
    preview.className = "mt-4 rounded-2xl border border-white/10 bg-black/20 p-4";

    const headline = document.createElement("div");
    headline.className = "whitespace-normal break-words text-sm font-semibold leading-5 text-white";
    headline.textContent = chance.aiPreview.headline;

    const paragraph = document.createElement("p");
    paragraph.className = "mt-2 whitespace-normal break-words text-sm leading-6 text-white/60";
    paragraph.textContent = chance.aiPreview.summary;

    preview.appendChild(headline);
    preview.appendChild(paragraph);
    wrapper.appendChild(preview);
  } else {
    const missingPreview = document.createElement("p");
    missingPreview.className = "mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55";
    missingPreview.textContent = "AI wording has not been generated yet, but the score prediction and percentages are available now.";
    wrapper.appendChild(missingPreview);
  }

  const grid = document.createElement("div");
  grid.className = "mt-4 grid gap-3 sm:grid-cols-3";
  grid.appendChild(createChanceCard({ label: fixture.homeTeam.name, value: chance.home, type: "home" }));
  grid.appendChild(createChanceCard({ label: "Draw", value: chance.draw, type: "draw" }));
  grid.appendChild(createChanceCard({ label: fixture.awayTeam.name, value: chance.away, type: "away" }));

  const explanation = document.createElement("p");
  explanation.className = "mt-3 text-xs leading-5 text-white/45";
  explanation.textContent = chance.explanation;

  wrapper.appendChild(grid);
  wrapper.appendChild(explanation);

  return wrapper;
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

  const target = element.parentElement ?? element;
  if (target.querySelector(`[data-fixture-win-chance-for="${fixture.id}"]`)) {
    return;
  }

  const badge = createCompactWinChanceBadge(fixture);
  if (badge) target.appendChild(badge);

  if (!target.querySelector(`[data-fixture-full-ai-for="${fixture.id}"]`)) {
    const fullPanel = createFullWinChancePanel(fixture);
    if (fullPanel) target.appendChild(fullPanel);
  }
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

function shouldRunOnPathname(pathname: string, teamId: string) {
  if (pathname.includes("/squad")) return false;
  if (pathname.includes("/prospects")) return false;
  if (pathname.includes("/edit")) return false;

  return [
    `/captain/team/${teamId}`,
    `/captain/team/${teamId}/fixtures`,
    `/captain/team/${teamId}/results`,
    `/captain/team/${teamId}/player-payments`,
    `/captain/team/${teamId}/match-fees`,
    `/captain/team/${teamId}/availability`,
  ].some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}

export default function CaptainFixtureBadgesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);
    if (!teamId) return;
    if (!shouldRunOnPathname(pathname, teamId)) return;

    let cancelled = false;

    void loadFixtureBadges(teamId).then((loadedFixtures) => {
      if (cancelled) return;
      injectFixtureBadges(loadedFixtures);
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return <CaptainCurrentLeagueTableBridge />;
}
