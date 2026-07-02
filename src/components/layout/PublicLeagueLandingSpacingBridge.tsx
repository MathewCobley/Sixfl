// ========================================
// File: src/components/layout/PublicLeagueLandingSpacingBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type PublicDivisionPayload = {
  divisions?: Array<{
    id: string;
    name: string;
    slug: string;
    teams: Array<{ id: string; name: string; logoUrl: string | null }>;
    table: Array<{
      team: { id: string; name: string; logoUrl: string | null };
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      points: number;
    }>;
    upcomingFixtures: Array<{
      id: string;
      kickoffAt: string;
      homeTeam: string;
      awayTeam: string;
    }>;
  }>;
};

function replaceSnapshotWithPricing() {
  const teamEntryHeadings = Array.from(document.querySelectorAll("p")).filter(
    (element) => element.textContent?.trim().toUpperCase() === "TEAM ENTRY",
  );

  for (const heading of teamEntryHeadings) {
    const card = heading.closest("div.rounded-3xl");
    if (!card || card.getAttribute("data-sixfl-combined-pricing-card") === "true") continue;

    card.setAttribute("data-sixfl-combined-pricing-card", "true");
    card.innerHTML = `
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Simple weekly pricing</p>
      <h2 class="mt-4 text-2xl font-bold text-white sm:text-3xl">Team and player fees</h2>
      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div class="rounded-3xl border border-white/10 bg-black/25 p-6">
          <div class="text-sm font-semibold text-white/55">Team entry</div>
          <div class="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span class="text-5xl font-black tracking-tight text-white">£40</span>
            <span class="pb-2 text-base font-bold text-white/55">per team / week</span>
          </div>
          <p class="mt-5 text-sm leading-6 text-white/65">Covers the weekly league operation, referees, fixtures, results and standings.</p>
        </div>
        <div class="rounded-3xl border border-white/10 bg-black/25 p-6">
          <div class="text-sm font-semibold text-white/55">Player match fee</div>
          <div class="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span class="text-5xl font-black tracking-tight text-white">£6</span>
            <span class="pb-2 text-base font-bold text-white/55">per player / match</span>
          </div>
          <p class="mt-5 text-sm leading-6 text-white/65">Players only pay when selected to play, using their secure payment link.</p>
        </div>
      </div>
      <div class="mt-5 grid gap-3 text-sm text-white/80">
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">Fixed weekly fixtures</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">Qualified referees, live results and league table</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">Simple team fee plus player match fees</div>
      </div>
    `;
  }

  const snapshotHeadings = Array.from(document.querySelectorAll("p")).filter(
    (element) => element.textContent?.trim().toUpperCase() === "SNAPSHOT",
  );

  for (const heading of snapshotHeadings) {
    const card = heading.closest("div.rounded-3xl");
    if (!card) continue;
    card.remove();
  }
}

function getLeagueSlugFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/leagues\/([^/]+)/);
  return match?.[1] ?? null;
}

function formatGoalDifference(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function clearDivisionPanels() {
  document.querySelector("[data-sixfl-public-division-panels]")?.remove();
  const table = document.getElementById("table");
  if (table instanceof HTMLElement && table.dataset.sixflHiddenForDivisions === "true") {
    table.style.display = "";
    delete table.dataset.sixflHiddenForDivisions;
  }
}

function hideCombinedLeagueTable(table: HTMLElement) {
  table.dataset.sixflHiddenForDivisions = "true";
  table.style.display = "none";
}

function renderDivisionPanels(payload: PublicDivisionPayload, slug: string) {
  const table = document.getElementById("table");
  if (!(table instanceof HTMLElement) || !payload.divisions?.length) return;

  const existing = document.querySelector("[data-sixfl-public-division-panels]");
  if (existing?.getAttribute("data-slug") === slug) {
    hideCombinedLeagueTable(table);
    return;
  }
  existing?.remove();

  const panel = document.createElement("section");
  panel.dataset.sixflPublicDivisionPanels = "true";
  panel.dataset.slug = slug;
  panel.className = "mb-8 overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]";

  const header = document.createElement("div");
  header.className = "border-b border-white/10 px-6 py-6 sm:px-8";

  const eyebrow = document.createElement("p");
  eyebrow.className = "text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400";
  eyebrow.textContent = "Divisions";

  const title = document.createElement("h2");
  title.className = "mt-3 text-2xl font-bold text-white sm:text-3xl";
  title.textContent = "Premiership and Championship";

  const copy = document.createElement("p");
  copy.className = "mt-3 max-w-2xl text-sm leading-6 text-white/60 sm:text-base";
  copy.textContent = "This league is split into separate divisions, each with its own teams, fixtures and standings.";

  header.append(eyebrow, title, copy);
  panel.appendChild(header);

  const divisionGrid = document.createElement("div");
  divisionGrid.className = "grid gap-6 p-4 sm:p-6 xl:grid-cols-2";

  for (const division of payload.divisions) {
    const card = document.createElement("article");
    card.className = "overflow-hidden rounded-3xl border border-white/10 bg-black/25";

    const cardHeader = document.createElement("div");
    cardHeader.className = "border-b border-white/10 px-5 py-5";

    const divisionTitle = document.createElement("h3");
    divisionTitle.className = "text-xl font-bold text-white";
    divisionTitle.textContent = division.name;

    const divisionMeta = document.createElement("p");
    divisionMeta.className = "mt-1 text-sm text-white/55";
    divisionMeta.textContent = `${division.teams.length} team${division.teams.length === 1 ? "" : "s"}`;

    cardHeader.append(divisionTitle, divisionMeta);
    card.appendChild(cardHeader);

    const rows = document.createElement("div");
    rows.className = "divide-y divide-white/10";

    if (division.table.length === 0) {
      const empty = document.createElement("div");
      empty.className = "px-5 py-5 text-sm text-white/55";
      empty.textContent = "Teams will appear here once they are assigned to this division.";
      rows.appendChild(empty);
    } else {
      division.table.forEach((row, index) => {
        const item = document.createElement("div");
        item.className = "grid grid-cols-[44px_minmax(0,1fr)_44px_44px_52px] items-center gap-3 px-5 py-3 text-sm";

        const pos = document.createElement("div");
        pos.className = index === 0 ? "font-black text-emerald-300" : "font-semibold text-white/65";
        pos.textContent = String(index + 1);

        const team = document.createElement("div");
        team.className = "truncate font-semibold text-white";
        team.textContent = row.team.name;

        const played = document.createElement("div");
        played.className = "text-center text-white/65";
        played.textContent = String(row.played);

        const gd = document.createElement("div");
        gd.className = "text-center text-white/65";
        gd.textContent = formatGoalDifference(row.goalDifference);

        const points = document.createElement("div");
        points.className = "text-center font-black text-white";
        points.textContent = String(row.points);

        item.append(pos, team, played, gd, points);
        rows.appendChild(item);
      });
    }

    const footer = document.createElement("div");
    footer.className = "grid grid-cols-[44px_minmax(0,1fr)_44px_44px_52px] gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40";
    footer.innerHTML = "<div>Pos</div><div>Team</div><div class='text-center'>P</div><div class='text-center'>GD</div><div class='text-center'>Pts</div>";

    card.append(rows, footer);
    divisionGrid.appendChild(card);
  }

  panel.appendChild(divisionGrid);
  table.parentElement?.insertBefore(panel, table);
  hideCombinedLeagueTable(table);
}

async function ensureDivisionPanels(pathname: string | null) {
  const slug = getLeagueSlugFromPathname(pathname);
  if (!slug) {
    clearDivisionPanels();
    return;
  }

  const existing = document.querySelector("[data-sixfl-public-division-panels]");
  if (existing?.getAttribute("data-slug") === slug) return;

  try {
    const response = await fetch(`/api/public/leagues/${encodeURIComponent(slug)}/divisions`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const payload = (await response.json()) as PublicDivisionPayload;
    renderDivisionPanels(payload, slug);
  } catch {
    // Division panels are progressive enhancement; leave the rest of the page alone.
  }
}

function ensureRegisterModalCloseButton(registerSection: HTMLElement) {
  if (registerSection.querySelector(".sixfl-register-modal-close")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sixfl-register-modal-close";
  button.setAttribute("aria-label", "Close registration form");
  button.textContent = "Close";
  button.addEventListener("click", () => {
    document.body.classList.remove("sixfl-register-modal-open");
  });

  registerSection.prepend(button);
}

function openRegisterModal() {
  const registerSection = document.getElementById("register");
  if (!registerSection) return;

  ensureRegisterModalCloseButton(registerSection);
  document.body.classList.add("sixfl-register-modal-open");
}

export default function PublicLeagueLandingSpacingBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/leagues/")) return;

    replaceSnapshotWithPricing();
    void ensureDivisionPanels(pathname);

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const registerLink = target?.closest('a[href="#register"]');

      if (registerLink) {
        event.preventDefault();
        openRegisterModal();
        return;
      }

      if (
        document.body.classList.contains("sixfl-register-modal-open") &&
        event.target instanceof HTMLElement &&
        event.target.id === "register"
      ) {
        document.body.classList.remove("sixfl-register-modal-open");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        document.body.classList.remove("sixfl-register-modal-open");
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    const observer = new MutationObserver(() => {
      replaceSnapshotWithPricing();
      void ensureDivisionPanels(pathname);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("sixfl-register-modal-open");
      clearDivisionPanels();
    };
  }, [pathname]);

  if (!pathname?.startsWith("/leagues/")) {
    return null;
  }

  return (
    <style jsx global>{`
      main > div.min-h-screen > section:first-child.relative.isolate {
        min-height: auto !important;
      }

      main > div.min-h-screen > section:first-child.relative.isolate > div.relative {
        min-height: auto !important;
        align-items: flex-start !important;
        padding-top: 2rem !important;
        padding-bottom: 2rem !important;
      }

      main > div.min-h-screen > section:first-child.relative.isolate + section {
        margin-top: 0 !important;
      }

      body.sixfl-register-modal-open {
        overflow: hidden !important;
      }

      body.sixfl-register-modal-open #register {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow-y: auto !important;
        margin: 0 !important;
        padding: 1rem !important;
        background: radial-gradient(circle at top, rgba(16, 185, 129, 0.18), transparent 34%), rgba(0, 0, 0, 0.84) !important;
        backdrop-filter: blur(14px) !important;
      }

      body.sixfl-register-modal-open #register > :not(.sixfl-register-modal-close) {
        width: min(920px, 100%) !important;
        max-height: calc(100vh - 2rem) !important;
        overflow-y: auto !important;
        border-radius: 1.75rem !important;
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.58) !important;
      }

      .sixfl-register-modal-close {
        position: fixed !important;
        top: 1rem !important;
        right: 1rem !important;
        z-index: 10000 !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        border-radius: 999px !important;
        background: rgba(0, 0, 0, 0.72) !important;
        color: white !important;
        padding: 0.75rem 1rem !important;
        font-size: 0.875rem !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }

      .sixfl-register-modal-close:hover {
        background: rgba(16, 185, 129, 0.18) !important;
      }
    `}</style>
  );
}
