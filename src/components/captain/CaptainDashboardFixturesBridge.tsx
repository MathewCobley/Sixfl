// ========================================
// File: src/components/captain/CaptainDashboardFixturesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import CaptainDashboardAiPredictorBridge from "@/components/captain/CaptainDashboardAiPredictorBridge";

type DashboardFixturesPayload = {
  count: number;
  nextFixture: {
    id: string;
    label: string;
    kickoffLabel: string;
    venueName: string;
    fixturesHref: string;
  } | null;
  fixtures: Array<{
    id: string;
    label: string;
    kickoffLabel: string;
    venueName: string;
  }>;
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)(?:\/)?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function findNextFixtureHeading() {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2"));
  return headings.find((heading) =>
    heading.textContent?.trim().toLowerCase() === "no upcoming published fixture" ||
    heading.closest("section")?.textContent?.toLowerCase().includes("next fixture"),
  ) ?? null;
}

function findNextFixtureSection() {
  const heading = findNextFixtureHeading();
  return heading?.closest("section") ?? null;
}

function findMatchScheduleList() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
  const heading = headings.find((item) => item.textContent?.trim().toLowerCase() === "match schedule");
  const card = heading?.closest("div.rounded-3xl");
  return card?.querySelector("div.divide-y") ?? null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateNextFixture(payload: DashboardFixturesPayload) {
  if (!payload.nextFixture) return;

  const section = findNextFixtureSection();
  const heading = findNextFixtureHeading();

  if (!section || !heading) return;

  heading.textContent = payload.nextFixture.label;

  const paragraphs = Array.from(section.querySelectorAll<HTMLParagraphElement>("p"));
  const description = paragraphs.find((paragraph) =>
    paragraph.textContent?.includes("Your next match will appear") ||
    paragraph.textContent?.includes("Venue TBC") ||
    paragraph.textContent?.includes("Rossett") ||
    paragraph.className.includes("max-w-2xl"),
  );

  if (description) {
    description.textContent = `${payload.nextFixture.kickoffLabel} · ${payload.nextFixture.venueName}`;
  }
}

function updateScheduleList(payload: DashboardFixturesPayload) {
  const list = findMatchScheduleList();
  if (!list || payload.fixtures.length === 0) return;

  list.innerHTML = payload.fixtures
    .map(
      (fixture, index) => `
        <div class="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-base font-semibold text-white">${escapeHtml(fixture.label)}</div>
              ${index === 0 ? `<span class="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100">Next up</span>` : ""}
            </div>
            <div class="mt-1 text-sm text-white/60">${escapeHtml(fixture.kickoffLabel)}</div>
          </div>
          <div class="text-sm sm:text-right">
            <div class="text-white/65">${escapeHtml(fixture.venueName)}</div>
            <div class="mt-2">
              <span class="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/75">Awaiting confirmation</span>
            </div>
          </div>
        </div>
      `,
    )
    .join("");
}

async function refreshDashboardFixtures(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const section = findNextFixtureSection();
  if (!section || section.getAttribute("data-dashboard-fixtures-loaded") === teamId) return;

  try {
    const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/dashboard-fixtures`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const payload = (await response.json()) as DashboardFixturesPayload;
    if (!payload.nextFixture) return;

    updateNextFixture(payload);
    updateScheduleList(payload);
    section.setAttribute("data-dashboard-fixtures-loaded", teamId);
    window.dispatchEvent(new CustomEvent("sixfl:captain-dashboard-fixtures-updated"));
  } catch {
    // Keep the server-rendered dashboard if this enhancement fails.
  }
}

export default function CaptainDashboardFixturesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/captain/team/")) return;

    const frame = window.requestAnimationFrame(() => {
      void refreshDashboardFixtures(pathname);
    });
    const timer = window.setTimeout(() => {
      void refreshDashboardFixtures(pathname);
    }, 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return <CaptainDashboardAiPredictorBridge />;
}
