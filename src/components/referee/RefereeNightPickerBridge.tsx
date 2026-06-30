// ========================================
// File: src/components/referee/RefereeNightPickerBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type NightLink = {
  href: string;
  title: string;
  dateLabel: string;
  statusLabel: string;
  fixtureLabel: string;
  isLegacy: boolean;
  isClosed: boolean;
};

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function normaliseText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parseRefereeNightDate(value: string) {
  const match = value.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);

  if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) return null;

  return new Date(year, month, day, 12, 0, 0, 0);
}

function isLegacyOpenNight(input: { statusLabel: string; dateLabel: string }) {
  const status = input.statusLabel.toLowerCase();
  if (!["scheduled", "draft", "reopened"].some((item) => status.includes(item))) return false;

  const nightDate = parseRefereeNightDate(input.dateLabel);
  if (!nightDate) return false;

  const cutoff = new Date();
  cutoff.setHours(12, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 14);

  return nightDate.getTime() < cutoff.getTime();
}

function isClosedStatus(statusLabel: string) {
  const status = statusLabel.toLowerCase();
  return ["submitted", "approved", "settled", "cancelled"].some((item) => status.includes(item));
}

function getNightScheduleDetails() {
  return document.getElementById("referee-nights") as HTMLDetailsElement | null;
}

function getNightLinks(): NightLink[] {
  const details = getNightScheduleDetails();
  if (!details) return [];

  const cards = Array.from(details.querySelectorAll<HTMLElement>("article"));

  return cards.flatMap((card) => {
    const link = card.querySelector<HTMLAnchorElement>("a[href^='/referee/night/']");
    if (!link) return [];

    const statusLabel = normaliseText(card.querySelector("span")?.textContent) || "Scheduled";
    const dateLabel =
      Array.from(card.querySelectorAll("span"))
        .map((item) => normaliseText(item.textContent))
        .find((item) => /\d{4}/.test(item)) ?? "Date TBC";
    const title = normaliseText(card.querySelector("h3")?.textContent) || "Referee night";
    const fixtureLabel =
      Array.from(card.querySelectorAll("p"))
        .map((item) => normaliseText(item.textContent))
        .find((item) => item.includes("fixture")) ?? "";

    return [
      {
        href: link.getAttribute("href") ?? "#",
        title,
        dateLabel,
        statusLabel,
        fixtureLabel,
        isLegacy: isLegacyOpenNight({ statusLabel, dateLabel }),
        isClosed: isClosedStatus(statusLabel),
      },
    ];
  });
}

function createNightButton(night: NightLink) {
  const link = document.createElement("a");
  link.href = night.href;
  link.className = [
    "block rounded-2xl border p-4 transition",
    night.isClosed
      ? "border-white/10 bg-black/20 hover:bg-white/[0.04]"
      : "border-emerald-400/25 bg-emerald-500/12 hover:bg-emerald-500/18",
  ].join(" ");

  link.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">${night.statusLabel}</span>
    </div>
    <div class="mt-3 text-base font-semibold text-white">${night.title}</div>
    <div class="mt-1 text-sm text-white/55">${night.dateLabel}${night.fixtureLabel ? ` · ${night.fixtureLabel}` : ""}</div>
    <div class="mt-3 text-sm font-semibold text-emerald-100">${night.isClosed ? "View night" : "Open night sheet"}</div>
  `;

  return link;
}

function updateHeroForLegacyNext(nights: NightLink[]) {
  const firstNight = nights[0];
  if (!firstNight?.isLegacy) return;

  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find(
    (item) => normaliseText(item.textContent) === "Next referee night",
  );

  if (heading) {
    heading.textContent = "Choose a referee night";
  }

  const nextActionLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
    normaliseText(link.textContent).includes("Next action") || normaliseText(link.textContent).includes("Open night sheet"),
  );

  if (nextActionLink?.getAttribute("href")?.startsWith("/referee/night/")) {
    nextActionLink.href = "#referee-night-picker";
    const title = Array.from(nextActionLink.querySelectorAll("p")).find((item) =>
      normaliseText(item.textContent) === "Open night sheet",
    );
    if (title) title.textContent = "Choose night sheet";
  }

  Array.from(document.querySelectorAll("span"))
    .filter((item) => normaliseText(item.textContent) === "Next up")
    .forEach((item) => item.remove());
}

function removeLegacyScheduleCards() {
  const details = getNightScheduleDetails();
  if (!details) return;

  const cards = Array.from(details.querySelectorAll<HTMLElement>("article"));
  for (const card of cards) {
    const statusLabel = normaliseText(card.querySelector("span")?.textContent) || "Scheduled";
    const dateLabel =
      Array.from(card.querySelectorAll("span"))
        .map((item) => normaliseText(item.textContent))
        .find((item) => /\d{4}/.test(item)) ?? "Date TBC";

    if (isLegacyOpenNight({ statusLabel, dateLabel })) {
      card.remove();
    }
  }
}

function renderNightPicker() {
  const existing = document.querySelector("[data-referee-night-picker='1']");
  if (existing) existing.remove();

  const details = getNightScheduleDetails();
  if (!details?.parentElement) return;

  const nights = getNightLinks();
  if (nights.length === 0) return;

  const current = nights.filter((night) => !night.isLegacy && !night.isClosed);
  const legacy = nights.filter((night) => night.isLegacy);
  const closed = nights.filter((night) => night.isClosed);

  updateHeroForLegacyNext(nights);
  removeLegacyScheduleCards();

  const section = document.createElement("section");
  section.id = "referee-night-picker";
  section.dataset.refereeNightPicker = "1";
  section.className = "rounded-3xl border border-emerald-400/15 bg-white/[0.04] p-5 sm:p-6";

  const primaryList = current.map((night) => createNightButton(night).outerHTML).join("");
  const closedList = closed.slice(0, 5).map((night) => createNightButton(night).outerHTML).join("");

  section.innerHTML = `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Night sheets</p>
        <h2 class="mt-2 text-2xl font-semibold text-white">Choose the night you want to work on</h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-white/60">Only real referee nights that need action are shown here. Historic fixture results stay in the league records and do not need a referee night sheet.</p>
      </div>
      <div class="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-white/55">${current.length} open</div>
    </div>

    <div class="mt-5 grid gap-3 ${current.length > 1 ? "lg:grid-cols-2" : ""}">
      ${primaryList || `<div class="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/55">No current open referee night sheets.</div>`}
    </div>

    ${legacy.length > 0 ? `
      <div class="mt-5 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-50/75">
        ${legacy.length} historic imported fixture record${legacy.length === 1 ? "" : "s"} hidden from referee work. Results and payments remain on the league/admin records; no referee night action is needed.
      </div>
    ` : ""}

    ${closed.length > 0 ? `
      <details class="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <summary class="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-white/75 [&::-webkit-details-marker]:hidden">Submitted / closed nights (${closed.length})</summary>
        <div class="grid gap-3 border-t border-white/10 p-4 lg:grid-cols-2">${closedList}</div>
      </details>
    ` : ""}
  `;

  details.insertAdjacentElement("beforebegin", section);
  details.open = current.length > 0;
}

export default function RefereeNightPickerBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/referee") return;

    const frame = window.requestAnimationFrame(renderNightPicker);
    const observer = new MutationObserver(renderNightPicker);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.querySelector("[data-referee-night-picker='1']")?.remove();
    };
  }, [pathname]);

  return null;
}
