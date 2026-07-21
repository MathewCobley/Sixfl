// ========================================
// File: src/components/captain/CaptainStoredPredictionBridge.tsx
// ========================================

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
  const match = pathname.match(/^\/captain\/team\/([^/]+)\/?$/);
  return match?.[1] ?? "";
}

function getOutcome(home: number, away: number) {
  if (home > away) return "WIN";
  if (home < away) return "LOSS";
  return "DRAW";
}

function findLatestScoresSection() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
  const heading = headings.find((item) => item.textContent?.trim() === "Latest scores");
  return heading?.closest("section") ?? null;
}

function addPredictionToRow(input: {
  row: HTMLElement;
  fixture: FixturePrediction;
  relatedTeamIds: Set<string>;
}) {
  if (input.row.querySelector(`[data-sixfl-stored-prediction="${input.fixture.id}"]`)) {
    return;
  }

  const prediction = input.fixture.storedPrediction;
  if (!prediction) return;

  const isHome = input.relatedTeamIds.has(input.fixture.homeTeamId);
  const predictedFor = isHome ? prediction.homeScore : prediction.awayScore;
  const predictedAgainst = isHome ? prediction.awayScore : prediction.homeScore;

  const scoreText = Array.from(input.row.querySelectorAll<HTMLElement>("div"))
    .map((element) => element.textContent?.trim() ?? "")
    .find((value) => /^\d+\s*-\s*\d+$/.test(value));
  const scoreMatch = scoreText?.match(/^(\d+)\s*-\s*(\d+)$/);
  const actualFor = scoreMatch ? Number(scoreMatch[1]) : null;
  const actualAgainst = scoreMatch ? Number(scoreMatch[2]) : null;

  const exact = actualFor === predictedFor && actualAgainst === predictedAgainst;
  const correctOutcome =
    actualFor !== null &&
    actualAgainst !== null &&
    getOutcome(actualFor, actualAgainst) === getOutcome(predictedFor, predictedAgainst);

  const details = document.createElement("div");
  details.dataset.sixflStoredPrediction = input.fixture.id;
  details.className = "mt-3 flex flex-wrap items-center gap-2";

  const predictionText = document.createElement("span");
  predictionText.className =
    "inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100";
  predictionText.textContent = `SIXFL AI predicted ${predictedFor} - ${predictedAgainst}`;
  details.appendChild(predictionText);

  const resultBadge = document.createElement("span");
  resultBadge.className = exact
    ? "inline-flex rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100"
    : correctOutcome
      ? "inline-flex rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-100"
      : "inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-white/50";
  resultBadge.textContent = exact ? "Exact score 🎯" : correctOutcome ? "Correct result" : "Prediction missed";
  details.appendChild(resultBadge);

  const leftColumn = input.row.querySelector<HTMLElement>("div > div");
  (leftColumn ?? input.row).appendChild(details);
}

function applyPredictions(payload: PredictionPayload) {
  const section = findLatestScoresSection();
  if (!section) return;

  const relatedTeamIds = new Set(payload.relatedTeamIds ?? []);
  const fixtures = (payload.fixtures ?? []).filter((fixture) => fixture.storedPrediction);
  if (fixtures.length === 0) return;

  const rows = Array.from(
    section.querySelectorAll<HTMLElement>(":scope > div.divide-y > div.px-6.py-5"),
  );

  for (const row of rows) {
    const opponentElement = row.querySelector<HTMLElement>("div.text-base.font-semibold.text-white");
    const opponentName = opponentElement?.textContent?.trim();
    if (!opponentName) continue;

    const fixture = fixtures.find((item) => {
      if (section.querySelector(`[data-sixfl-stored-prediction="${item.id}"]`)) return false;
      const isHome = relatedTeamIds.has(item.homeTeamId);
      const opponent = isHome ? item.awayTeam.name : item.homeTeam.name;
      return opponent === opponentName;
    });

    if (fixture) addPredictionToRow({ row, fixture, relatedTeamIds });
  }
}

export default function CaptainStoredPredictionBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    const controller = new AbortController();
    let payload: PredictionPayload | null = null;

    void fetch(`/api/captain/team/${encodeURIComponent(teamId)}/fixture-badges`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as PredictionPayload | null;
      })
      .then((loaded) => {
        if (!loaded || controller.signal.aborted) return;
        payload = loaded;
        applyPredictions(loaded);
      });

    const observer = new MutationObserver(() => {
      if (payload) applyPredictions(payload);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
