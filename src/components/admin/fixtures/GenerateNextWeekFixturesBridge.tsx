// ========================================
// File: src/components/admin/fixtures/GenerateNextWeekFixturesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getSelectedLeagueId() {
  const leagueSelects = Array.from(
    document.querySelectorAll<HTMLSelectElement>('select[name="leagueId"]'),
  );

  const visibleSelect = leagueSelects.find(
    (select) => !select.disabled && select.offsetParent !== null && select.value,
  );

  return visibleSelect?.value || leagueSelects.find((select) => select.value)?.value || "";
}

function getTargetContainer() {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
  const fixturesHeading = headings.find(
    (heading) => heading.textContent?.trim() === "Fixtures",
  );

  if (fixturesHeading) {
    const header = fixturesHeading.closest("div.flex.flex-col.gap-4.border-b");
    if (header instanceof HTMLElement) return header;
  }

  return document.querySelector("main") as HTMLElement | null;
}

function getResponseError(input: {
  response: Response;
  responseText: string;
  payload: { error?: string; requestId?: string } | null;
}) {
  const requestSuffix = input.payload?.requestId
    ? ` Reference: ${input.payload.requestId}.`
    : "";

  if (input.payload?.error?.trim()) {
    return `${input.payload.error.trim()}${requestSuffix}`;
  }

  const cleanText = input.responseText
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleanText) {
    return `${cleanText.slice(0, 220)}${requestSuffix}`;
  }

  return `Fixture generation failed with HTTP ${input.response.status}.${requestSuffix}`;
}

async function generateNextWeek(button: HTMLButtonElement, status: HTMLElement) {
  const leagueId = getSelectedLeagueId();

  if (!leagueId) {
    status.className =
      "rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100";
    status.textContent =
      "Choose a league in the fixture form first, then try generating the next week again.";
    return;
  }

  button.disabled = true;
  button.textContent = "Generating...";
  status.className =
    "rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100";
  status.textContent =
    "Looking at previous fixtures and creating a draft set for the next week...";

  try {
    const response = await fetch("/api/admin/fixtures/generate-next-week", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ leagueId }),
    });

    const responseText = await response.text();
    let payload: {
      created?: number;
      round?: number;
      error?: string;
      requestId?: string;
    } | null = null;

    if (responseText) {
      try {
        payload = JSON.parse(responseText) as typeof payload;
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      throw new Error(
        getResponseError({ response, responseText, payload }),
      );
    }

    if (!payload || payload.created === undefined) {
      throw new Error(
        "The server returned an incomplete fixture-generation response. No fixtures were assumed to have been created.",
      );
    }

    status.className =
      "rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100";
    status.textContent = `Created ${payload.created} draft fixture${
      payload.created === 1 ? "" : "s"
    }${payload.round ? ` for week ${payload.round}` : ""}. Reloading...`;
    window.location.reload();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Generate next week fixtures";
    status.className =
      "rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100";
    status.textContent =
      error instanceof Error
        ? error.message
        : "Could not generate next week fixtures.";
  }
}

function addButton() {
  if (document.querySelector("[data-generate-next-week-fixtures]")) return;

  const container = getTargetContainer();
  if (!container) return;

  const panel = document.createElement("section");
  panel.dataset.generateNextWeekFixtures = "true";
  panel.className =
    "rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5";

  const title = document.createElement("div");
  title.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/70">Smart fixtures</p>
    <h3 class="mt-2 text-xl font-semibold text-white">Generate next week fixtures</h3>
    <p class="mt-2 text-sm leading-6 text-sky-100/75">Creates one draft week for the selected league by looking at who has already played who. Nothing is published, so you can edit the fixtures before making them live.</p>
  `;

  const actionRow = document.createElement("div");
  actionRow.className =
    "mt-4 flex flex-col gap-3 sm:flex-row sm:items-center";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Generate next week fixtures";
  button.className =
    "inline-flex h-12 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-400/15 px-5 text-sm font-semibold text-sky-50 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50";

  const status = document.createElement("div");
  status.className =
    "rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55";
  status.textContent =
    "Draft fixtures only — review and edit before publishing.";

  button.addEventListener("click", () => {
    void generateNextWeek(button, status);
  });

  actionRow.append(button, status);
  panel.append(title, actionRow);

  container.appendChild(panel);
}

export default function GenerateNextWeekFixturesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/fixtures") return;

    addButton();

    const observer = new MutationObserver(addButton);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
