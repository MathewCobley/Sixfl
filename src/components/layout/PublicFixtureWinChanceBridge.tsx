// ========================================
// File: src/components/layout/PublicFixtureWinChanceBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type FixtureWinChance = {
  home: number;
  draw: number;
  away: number;
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

function findFixtureCard(fixture: FixtureWinChanceItem) {
  const home = normaliseText(fixture.homeTeamName);
  const away = normaliseText(fixture.awayTeamName);

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("article, div"),
  )
    .filter((element) => {
      const text = normaliseText(element.textContent ?? "");
      if (!text.includes(home) || !text.includes(away)) return false;
      if (text.includes("win chance")) return false;
      if (element.querySelector(`[data-public-fixture-win-chance="${fixture.id}"]`)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => (a.textContent?.length ?? 0) - (b.textContent?.length ?? 0));

  return candidates[0] ?? null;
}

function createChanceCard(input: {
  label: string;
  value: number;
  type: "home" | "draw" | "away";
}) {
  const card = document.createElement("div");
  card.className = "rounded-2xl border border-white/10 bg-black/25 p-3";

  const top = document.createElement("div");
  top.className = "flex items-center justify-between gap-2";

  const label = document.createElement("div");
  label.className = "truncate text-xs font-semibold text-white/75";
  label.textContent = input.label;
  label.title = input.label;

  const value = document.createElement("div");
  value.className = "text-lg font-black text-white";
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

function createWinChanceBlock(fixture: FixtureWinChanceItem) {
  const block = document.createElement("div");
  block.dataset.publicFixtureWinChance = fixture.id;
  block.className =
    "mt-5 rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)]";

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center justify-between gap-2";

  const headingWrap = document.createElement("div");

  const eyebrow = document.createElement("div");
  eyebrow.className =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300";
  eyebrow.textContent = "Win chance";

  const helper = document.createElement("div");
  helper.className = "mt-1 text-xs text-white/45";
  helper.textContent = `Form-based prediction · ${fixture.winChance.confidence} confidence`;

  headingWrap.appendChild(eyebrow);
  headingWrap.appendChild(helper);

  const funBadge = document.createElement("span");
  funBadge.className =
    "rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45";
  funBadge.textContent = "Just for fun";

  header.appendChild(headingWrap);
  header.appendChild(funBadge);

  const grid = document.createElement("div");
  grid.className = "mt-4 grid gap-3 sm:grid-cols-3";
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
