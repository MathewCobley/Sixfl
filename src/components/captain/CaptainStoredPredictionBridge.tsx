"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type StoredPrediction = {
  homeScore: number;
  awayScore: number;
  generatedAt: string;
};

type FixturePrediction = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  storedPrediction: StoredPrediction | null;
};

type PredictionPayload = {
  relatedTeamIds?: string[];
  fixtures?: FixturePrediction[];
};

function getTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/?$/)?.[1] ?? "";
}

function outcome(forScore: number, againstScore: number) {
  if (forScore > againstScore) return "WIN";
  if (forScore < againstScore) return "LOSS";
  return "DRAW";
}

function latestScoresCard() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).find(
    (item) => item.textContent?.trim() === "Latest scores",
  );
  if (!heading) return null;

  const header = heading.parentElement?.parentElement;
  const card = header?.parentElement;
  return card instanceof HTMLElement ? card : null;
}

function resultRows(card: HTMLElement) {
  const list = Array.from(card.children).find(
    (child) => child instanceof HTMLElement && child.classList.contains("divide-y"),
  );
  if (!(list instanceof HTMLElement)) return [];

  return Array.from(list.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && /\b\d+\s*-\s*\d+\b/.test(child.textContent ?? ""),
  );
}

function addPrediction(
  row: HTMLElement,
  fixture: FixturePrediction,
  relatedTeamIds: Set<string>,
) {
  if (row.querySelector(`[data-sixfl-stored-prediction="${fixture.id}"]`)) return;
  const prediction = fixture.storedPrediction;
  if (!prediction) return;

  const isHome = relatedTeamIds.has(fixture.homeTeamId);
  const predictedFor = isHome ? prediction.homeScore : prediction.awayScore;
  const predictedAgainst = isHome ? prediction.awayScore : prediction.homeScore;
  const scoreMatch = row.textContent?.match(/\b(\d+)\s*-\s*(\d+)\b/);
  const actualFor = scoreMatch ? Number(scoreMatch[1]) : null;
  const actualAgainst = scoreMatch ? Number(scoreMatch[2]) : null;
  const exact = actualFor === predictedFor && actualAgainst === predictedAgainst;
  const correctResult =
    actualFor !== null &&
    actualAgainst !== null &&
    outcome(actualFor, actualAgainst) === outcome(predictedFor, predictedAgainst);

  const details = document.createElement("div");
  details.dataset.sixflStoredPrediction = fixture.id;
  details.className = "mt-3 flex flex-wrap items-center gap-2";

  const predictionBadge = document.createElement("span");
  predictionBadge.className =
    "inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100";
  predictionBadge.textContent = `SIXFL AI predicted ${predictedFor} - ${predictedAgainst}`;

  const resultBadge = document.createElement("span");
  resultBadge.className = exact
    ? "inline-flex rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100"
    : correctResult
      ? "inline-flex rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100"
      : "inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/50";
  resultBadge.textContent = exact ? "Exact score 🎯" : correctResult ? "Correct result" : "Prediction missed";

  details.append(predictionBadge, resultBadge);

  const layout = row.firstElementChild as HTMLElement | null;
  const textColumn = layout?.firstElementChild as HTMLElement | null;
  const scoreColumn = layout?.lastElementChild as HTMLElement | null;

  if (layout && textColumn && scoreColumn && textColumn !== scoreColumn) {
    layout.classList.remove("items-center");
    layout.classList.add("items-start");
    textColumn.classList.add("min-w-0", "flex-1");
    scoreColumn.classList.add("shrink-0");
    textColumn.appendChild(details);
    return;
  }

  row.appendChild(details);
}

function applyPredictions(payload: PredictionPayload) {
  const card = latestScoresCard();
  if (!card) return false;
  const relatedTeamIds = new Set(payload.relatedTeamIds ?? []);
  const fixtures = (payload.fixtures ?? []).filter((fixture) => fixture.storedPrediction);
  if (fixtures.length === 0) return true;

  const rows = resultRows(card);
  for (const row of rows) {
    const normalised = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const fixture = fixtures.find((candidate) => {
      if (card.querySelector(`[data-sixfl-stored-prediction="${candidate.id}"]`)) return false;
      const isHome = relatedTeamIds.has(candidate.homeTeamId);
      const opponent = isHome ? candidate.awayTeam.name : candidate.homeTeam.name;
      return normalised.includes(opponent);
    });
    if (fixture) addPrediction(row, fixture, relatedTeamIds);
  }
  return true;
}

export default function CaptainStoredPredictionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    const controller = new AbortController();
    let stopped = false;
    let timer: number | null = null;

    void fetch(`/api/captain/team/${encodeURIComponent(teamId)}/fixture-badges`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? ((await response.json()) as PredictionPayload) : null))
      .then((payload) => {
        if (!payload || stopped) return;
        let attempts = 0;
        const tryApply = () => {
          if (stopped) return;
          attempts += 1;
          const complete = applyPredictions(payload);
          if (!complete && attempts < 20) timer = window.setTimeout(tryApply, 150);
        };
        tryApply();
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error("Stored prediction display failed", error);
      });

    return () => {
      stopped = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
