// ========================================
// File: src/components/captain/CaptainDashboardAiPredictorBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type FixtureBadge = {
  id: string;
  fullLabel: string;
  winChance?: {
    home: number;
    draw: number;
    away: number;
    predictedResult: { label: string };
    confidence: "Low" | "Medium" | "High";
    explanation: string;
    aiPreview?: { headline: string; summary: string } | null;
  } | null;
};

type FixtureBadgesPayload = {
  fixtures?: FixtureBadge[];
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)(?:\/)?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function findNextFixtureSection() {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2"));
  const heading = headings.find((item) =>
    item.closest("section")?.textContent?.toLowerCase().includes("next fixture"),
  );

  return heading?.closest("section") ?? null;
}

function findNextFixtureHeading() {
  return findNextFixtureSection()?.querySelector<HTMLHeadingElement>("h2") ?? null;
}

function getMatchingFixture(fixtures: FixtureBadge[]) {
  const headingText = findNextFixtureHeading()?.textContent?.replace(/\s+/g, " ").trim();
  if (!headingText) return null;

  return fixtures.find((fixture) => fixture.fullLabel.replace(/\s+/g, " ").trim() === headingText) ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPredictor(fixture: FixtureBadge) {
  const chance = fixture.winChance;
  if (!chance) return "";

  return `
    <div data-dashboard-ai-predictor="${escapeHtml(fixture.id)}" class="mt-5 max-w-3xl rounded-3xl border border-emerald-400/15 bg-emerald-500/[0.07] p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">SIXFL AI Predictor</div>
          <div class="mt-1 text-xs text-white/45">${escapeHtml(chance.confidence)} confidence · Just for fun</div>
        </div>
        <div class="rounded-2xl border border-emerald-400/20 bg-black/25 px-5 py-3 text-center">
          <div class="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200/70">Predicted result</div>
          <div class="mt-1 text-2xl font-black text-white">${escapeHtml(chance.predictedResult.label)}</div>
        </div>
      </div>
      <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div class="text-sm font-semibold leading-5 text-white">${escapeHtml(chance.aiPreview?.headline ?? "Match preview")}</div>
        <p class="mt-2 text-sm leading-6 text-white/60">${escapeHtml(chance.aiPreview?.summary ?? chance.explanation)}</p>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-white/10 bg-black/25 p-3"><div class="text-xs text-white/55">Home</div><div class="mt-1 text-lg font-black text-white">${chance.home}%</div></div>
        <div class="rounded-2xl border border-white/10 bg-black/25 p-3"><div class="text-xs text-white/55">Draw</div><div class="mt-1 text-lg font-black text-white">${chance.draw}%</div></div>
        <div class="rounded-2xl border border-white/10 bg-black/25 p-3"><div class="text-xs text-white/55">Away</div><div class="mt-1 text-lg font-black text-white">${chance.away}%</div></div>
      </div>
    </div>
  `;
}

async function refreshDashboardAi(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  const section = findNextFixtureSection();

  if (!teamId || !section) return;

  try {
    const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/fixture-badges`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const payload = (await response.json().catch(() => null)) as FixtureBadgesPayload | null;
    const fixture = getMatchingFixture(payload?.fixtures ?? []);

    if (!fixture?.winChance) return;
    if (section.querySelector(`[data-dashboard-ai-predictor="${fixture.id}"]`)) return;

    section.querySelector("[data-dashboard-ai-predictor]")?.remove();
    const heading = findNextFixtureHeading();
    heading?.insertAdjacentHTML("afterend", renderPredictor(fixture));
  } catch {
    // Keep dashboard usable if predictor enhancement fails.
  }
}

export default function CaptainDashboardAiPredictorBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/captain/team/")) return;

    const run = () => {
      void refreshDashboardAi(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 900);
    window.addEventListener("sixfl:captain-dashboard-fixtures-updated", run);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("sixfl:captain-dashboard-fixtures-updated", run);
    };
  }, [pathname]);

  return null;
}
