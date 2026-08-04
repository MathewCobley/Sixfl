// ========================================
// File: src/components/TeamWeekUnavailabilityBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type AdminNotice = {
  id: string;
  teamName: string;
  leagueName: string | null;
  leagueSeason: string | null;
  divisionName: string | null;
  weekStart: string;
  note: string | null;
  status: "CLEAR" | "DRAFT_CONFLICT" | "PUBLISHED_CONFLICT";
  fixtures: Array<{
    id: string;
    kickoffAt: string;
    publishedAt: string | null;
    homeTeamName: string;
    awayTeamName: string;
  }>;
};

type AdminResponse = { notices?: AdminNotice[] };

function getCaptainTeamId(pathname: string) {
  return /^\/captain\/team\/([^/]+)(?:\/|$)/.exec(pathname)?.[1] ?? null;
}

function addCaptainNavLink(pathname: string) {
  const teamId = getCaptainTeamId(pathname);
  if (!teamId) return false;
  const nav = document.querySelector<HTMLElement>(".captain-team-nav");
  if (!nav) return false;
  if (nav.querySelector("[data-team-week-unavailability-nav]")) return true;
  const availabilityLink = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a")).find(
    (link) => link.textContent?.trim() === "Availability",
  );
  if (!availabilityLink) return false;
  const link = document.createElement("a");
  link.dataset.teamWeekUnavailabilityNav = "true";
  link.href = `/captain/team/${encodeURIComponent(teamId)}/weeks-unavailable`;
  link.textContent = "Weeks unavailable";
  link.className = availabilityLink.className;
  availabilityLink.insertAdjacentElement("afterend", link);
  return true;
}

function addAdminFixtureTab(pathname: string) {
  if (!pathname.startsWith("/admin/fixtures") && pathname !== "/admin/team-unavailability") {
    return true;
  }
  if (document.querySelector("[data-admin-team-unavailability-tab]")) return true;

  const main = document.querySelector<HTMLElement>("main") ?? document.body;
  const heading = Array.from(main.querySelectorAll<HTMLHeadingElement>("h1")).find((item) =>
    /fixture|unavailability/i.test(item.textContent ?? ""),
  );
  if (!heading) return false;

  const host = document.createElement("div");
  host.dataset.adminTeamUnavailabilityTab = "true";
  host.className = "mb-4 flex flex-wrap gap-2";

  const fixtures = document.createElement("a");
  fixtures.href = "/admin/fixtures";
  fixtures.textContent = "Fixtures";
  fixtures.className =
    "inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08]";

  const unavailable = document.createElement("a");
  unavailable.href = "/admin/team-unavailability";
  unavailable.textContent = "Teams unavailable";
  unavailable.className =
    pathname === "/admin/team-unavailability"
      ? "inline-flex items-center rounded-xl border border-amber-300/35 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-50"
      : "inline-flex items-center rounded-xl border border-amber-400/25 bg-amber-500/[0.08] px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/[0.14]";

  host.append(fixtures, unavailable);
  const headingBlock = heading.parentElement;
  headingBlock?.insertAdjacentElement("beforebegin", host);
  return Boolean(host.isConnected);
}

function addCaptainOverviewCallout(pathname: string) {
  const teamId = getCaptainTeamId(pathname);
  if (!teamId || pathname !== `/captain/team/${teamId}`) return false;
  if (document.querySelector("[data-team-week-unavailability-callout]")) return true;
  const pageRoot = document.querySelector<HTMLElement>(".captain-team-main > div.space-y-8");
  if (!pageRoot) return false;
  const section = document.createElement("section");
  section.dataset.teamWeekUnavailabilityCallout = "true";
  section.className = "rounded-3xl border border-amber-400/20 bg-amber-500/[0.08] p-5 sm:p-6";
  section.innerHTML = `<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/65">Advance fixture planning</p><h2 class="mt-2 text-xl font-semibold text-white">Know a week when your team cannot play?</h2><p class="mt-2 max-w-3xl text-sm leading-6 text-amber-50/70">Your team is assumed available. Only tell SIXFL about weeks when you already know you cannot field a team, before fixtures are published.</p></div><a href="/captain/team/${encodeURIComponent(teamId)}/weeks-unavailable" class="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300">Tell SIXFL</a></div>`;
  const firstSection = pageRoot.querySelector(":scope > section");
  if (firstSection?.nextSibling) pageRoot.insertBefore(section, firstSection.nextSibling);
  else pageRoot.appendChild(section);
  return true;
}

function formatWeekStart(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }).format(new Date(value));
}
function statusLabel(status: AdminNotice["status"]) {
  if (status === "PUBLISHED_CONFLICT") return "Published conflict";
  if (status === "DRAFT_CONFLICT") return "Draft conflict";
  return "Week off recorded";
}
function statusClasses(status: AdminNotice["status"]) {
  if (status === "PUBLISHED_CONFLICT") return "border-red-400/30 bg-red-500/12 text-red-100";
  if (status === "DRAFT_CONFLICT") return "border-amber-400/30 bg-amber-500/12 text-amber-100";
  return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
}

function renderAdminGeneratorPanel(notices: AdminNotice[]) {
  document.querySelectorAll<HTMLElement>("[data-team-week-unavailability-admin-panel]").forEach((panel) => panel.remove());
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((item) => item.textContent?.trim() === "Bulk Fixture Generator");
  const container = heading?.closest<HTMLElement>(".max-w-5xl");
  const headingBlock = heading?.parentElement;
  if (!container || !headingBlock) return false;
  const panel = document.createElement("section");
  panel.dataset.teamWeekUnavailabilityAdminPanel = "true";
  panel.className = "rounded-3xl border border-amber-400/25 bg-amber-500/[0.07] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)] md:p-6";
  const rows = notices.slice(0, 8).map((notice) => `<div class="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div class="font-semibold text-white">${notice.teamName}</div><div class="mt-1 text-xs leading-5 text-white/50">Week commencing ${formatWeekStart(notice.weekStart)} · ${notice.leagueName ?? "League not recorded"}${notice.divisionName ? ` · ${notice.divisionName}` : ""}${notice.note ? ` · ${notice.note}` : ""}</div></div><span class="inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(notice.status)}">${statusLabel(notice.status)}</span></div>`).join("");
  panel.innerHTML = `<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/75">Check before generating</p><h2 class="mt-2 text-2xl font-semibold text-white">Advance team unavailability</h2><p class="mt-2 max-w-3xl text-sm leading-6 text-amber-50/70">${notices.length === 0 ? "No teams have reported a future week off. Teams are assumed available." : `${notices.length} future team notice${notices.length === 1 ? "" : "s"} recorded. Resolve draft conflicts before publishing.`}</p></div><a href="/admin/team-unavailability" class="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-black/20 px-4 text-sm font-semibold text-amber-50 transition hover:bg-black/30">Open full list</a></div>${rows ? `<div class="mt-5 grid gap-3">${rows}</div>` : ""}`;
  headingBlock.insertAdjacentElement("afterend", panel);
  return true;
}

async function loadAdminNotices(signal: AbortSignal) {
  const response = await fetch("/api/admin/team-week-unavailability", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Team unavailability could not be loaded.");
  const payload = (await response.json()) as AdminResponse;
  return Array.isArray(payload.notices) ? payload.notices : [];
}

export default function TeamWeekUnavailabilityBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let frame = 0;
    let attempts = 0;

    async function install() {
      if (disposed) return;
      attempts += 1;
      const captainInstalled = getCaptainTeamId(pathname)
        ? addCaptainNavLink(pathname) && addCaptainOverviewCallout(pathname)
        : true;
      const adminTabInstalled = addAdminFixtureTab(pathname);
      let adminInstalled = true;
      if (pathname === "/admin/fixtures/generate") {
        try {
          const notices = await loadAdminNotices(controller.signal);
          if (!disposed) adminInstalled = renderAdminGeneratorPanel(notices);
        } catch (error) {
          if (!controller.signal.aborted) console.error(error);
        }
      }
      if ((!captainInstalled || !adminInstalled || !adminTabInstalled) && attempts < 20) {
        frame = window.requestAnimationFrame(() => void install());
      }
    }

    frame = window.requestAnimationFrame(() => void install());
    return () => {
      disposed = true;
      controller.abort();
      window.cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>("[data-team-week-unavailability-nav], [data-team-week-unavailability-callout], [data-team-week-unavailability-admin-panel], [data-admin-team-unavailability-tab]").forEach((element) => element.remove());
    };
  }, [pathname, searchKey]);

  return null;
}
