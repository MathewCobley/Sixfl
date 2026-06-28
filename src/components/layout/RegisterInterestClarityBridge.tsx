// ========================================
// File: src/components/layout/RegisterInterestClarityBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const OPTIONS = [
  {
    key: "team",
    label: "Team",
    title: "Register a full team",
    text: "Use this if you are entering a squad or you are the team contact.",
  },
  {
    key: "player",
    label: "Player",
    title: "Join as an individual player",
    text: "Use this if you need a team or want to be added to a squad.",
  },
  {
    key: "referee",
    label: "Referee",
    title: "Register referee interest",
    text: "Use this if you want to referee SIXFL league nights.",
  },
];

function hasRegisterInterestSelector() {
  return Boolean(document.querySelector('[data-register-interest-selector-guide="1"]'));
}

function getCurrentType(searchParams: URLSearchParams) {
  const type = searchParams.get("type")?.trim().toLowerCase();

  if (type === "player" || type === "referee") return type;
  return "team";
}

function getUrlForType(type: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams);
  params.set("type", type);

  return `/register-interest?${params.toString()}`;
}

function improveWatermark() {
  const watermarkImage = document.querySelector<HTMLImageElement>(
    'img[alt*="League badge"], img[alt*="league badge"], img[src*="/leagues/"]',
  );

  const wrapper = watermarkImage?.parentElement;
  if (!wrapper) return;

  wrapper.classList.remove("hidden");
  wrapper.style.display = "block";
  wrapper.style.opacity = "0.14";
  wrapper.style.width = "min(78vw, 520px)";
  wrapper.style.zIndex = "0";

  if (watermarkImage) {
    watermarkImage.style.filter = "drop-shadow(0 24px 70px rgba(16,185,129,0.18))";
  }
}

function addSelectorGuide(searchParams: URLSearchParams) {
  if (hasRegisterInterestSelector()) return;

  const teamLink = document.querySelector<HTMLAnchorElement>('a[href*="/register-interest?type=team"]');
  const selectorRow = teamLink?.parentElement;
  const headerRow = selectorRow?.parentElement;

  if (!selectorRow || !headerRow) return;

  selectorRow.classList.remove("flex-wrap");
  selectorRow.classList.add("rounded-2xl", "border", "border-emerald-400/20", "bg-emerald-500/10", "p-2");

  const currentType = getCurrentType(searchParams);

  const guide = document.createElement("section");
  guide.dataset.registerInterestSelectorGuide = "1";
  guide.className =
    "mb-5 rounded-3xl border border-emerald-400/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%),rgba(16,185,129,0.08)] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-5";

  const heading = document.createElement("div");
  heading.className = "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between";
  heading.innerHTML = `
    <div>
      <p class="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300">Step 1</p>
      <h2 class="mt-1 text-xl font-black tracking-tight text-white">Please choose who you would like to register</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-white/70">This is the standard SIXFL registration page. Pick the correct option first, then complete the form below.</p>
    </div>
    <div class="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-semibold text-white/60">Currently: ${OPTIONS.find((option) => option.key === currentType)?.label ?? "Team"}</div>
  `;

  const grid = document.createElement("div");
  grid.className = "mt-4 grid gap-3 md:grid-cols-3";

  for (const option of OPTIONS) {
    const active = option.key === currentType;
    const link = document.createElement("a");
    link.href = getUrlForType(option.key, searchParams);
    link.className = [
      "block rounded-2xl border p-4 transition hover:-translate-y-0.5",
      active
        ? "border-emerald-300/40 bg-emerald-400/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.06]",
    ].join(" ");
    link.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <span class="text-sm font-black text-white">${option.label}</span>
        <span class="rounded-full border ${active ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-100" : "border-white/10 bg-white/5 text-white/45"} px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]">${active ? "Selected" : "Choose"}</span>
      </div>
      <div class="mt-3 text-sm font-semibold text-white/85">${option.title}</div>
      <div class="mt-1 text-xs leading-5 text-white/55">${option.text}</div>
    `;
    grid.appendChild(link);
  }

  guide.appendChild(heading);
  guide.appendChild(grid);
  headerRow.insertAdjacentElement("afterend", guide);
}

export default function RegisterInterestClarityBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/register-interest") return;

    const params = new URLSearchParams(searchParams.toString());

    const frame = window.requestAnimationFrame(() => {
      addSelectorGuide(params);
      improveWatermark();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, searchParams]);

  return null;
}
