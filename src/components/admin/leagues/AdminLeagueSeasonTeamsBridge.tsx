// ========================================
// File: src/components/admin/leagues/AdminLeagueSeasonTeamsBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SeasonTeam = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  divisionId: string | null;
  divisionName: string | null;
};

type Division = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

type Payload = {
  league?: { id: string; name: string; season: string | null; slug: string };
  divisions?: Division[];
  teams?: SeasonTeam[];
};

function getLeagueIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/admin\/leagues\/([^/]+)(?:\/)?$/);
  return match?.[1] ?? null;
}

function findTeamsCard() {
  return Array.from(document.querySelectorAll("h2"))
    .find((heading) => heading.textContent?.trim() === "Teams")
    ?.closest("div.rounded-3xl") as HTMLElement | null;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function buttonClass(active: boolean) {
  return active
    ? "rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-50"
    : "rounded-xl border border-white/10 bg-[#0d1428] px-3 py-2 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:text-white";
}

function renderTeamRow(input: {
  leagueId: string;
  team: SeasonTeam;
  divisions: Division[];
}) {
  const row = document.createElement("div");
  row.className = "rounded-2xl border border-white/10 bg-white/[0.03] p-4";

  const layout = document.createElement("div");
  layout.className = "flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between";

  const link = document.createElement("a");
  link.href = `/admin/teams/${input.team.teamId}`;
  link.className = "flex min-w-0 items-center gap-3 transition hover:text-emerald-300";

  const badge = document.createElement("div");
  badge.className = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30 text-xs font-black text-white/70";
  badge.textContent = getInitials(input.team.teamName);

  const text = document.createElement("div");
  text.className = "min-w-0";
  const name = document.createElement("div");
  name.className = "truncate text-sm font-medium text-white";
  name.textContent = input.team.teamName;
  const contact = document.createElement("div");
  contact.className = "truncate text-xs text-white/45";
  contact.textContent = `${input.team.contactEmail || "No email"} · ${input.team.contactPhone || "No phone"}`;
  text.append(name, contact);
  link.append(badge, text);

  const controls = document.createElement("div");
  controls.className = "flex flex-wrap gap-2 lg:justify-end";

  const options = [{ id: "", name: "No division" }, ...input.divisions];
  for (const division of options) {
    const active = (input.team.divisionId ?? "") === division.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = buttonClass(active);
    button.textContent = division.name;
    button.addEventListener("click", async () => {
      button.textContent = "Saving…";
      await fetch(`/api/admin/leagues/${input.leagueId}/season-teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: input.team.teamId,
          divisionId: division.id || null,
        }),
      });
      window.location.reload();
    });
    controls.appendChild(button);
  }

  layout.append(link, controls);
  row.appendChild(layout);
  return row;
}

function renderTeamsCard(card: HTMLElement, leagueId: string, payload: Payload) {
  if (card.dataset.seasonTeamsRendered === leagueId) return;
  card.dataset.seasonTeamsRendered = leagueId;

  const teams = payload.teams ?? [];
  const divisions = payload.divisions ?? [];

  card.innerHTML = "";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-4 md:flex-row md:items-start md:justify-between";

  const copy = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "text-lg font-semibold text-white";
  title.textContent = "Teams in this season";
  const desc = document.createElement("p");
  desc.className = "mt-1 text-sm text-white/60";
  desc.textContent = `${teams.length} team${teams.length === 1 ? "" : "s"} entered in ${payload.league?.season || "this season"}. Assign Premiership/Championship here.`;
  copy.append(title, desc);

  const add = document.createElement("a");
  add.href = "/admin/teams/new";
  add.className = "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15";
  add.textContent = "Add team";

  header.append(copy, add);
  card.appendChild(header);

  const list = document.createElement("div");
  list.className = "mt-5 space-y-3";

  if (teams.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-white/60";
    empty.textContent = "No teams are entered in this season yet.";
    list.appendChild(empty);
  } else {
    for (const team of teams) {
      list.appendChild(renderTeamRow({ leagueId, team, divisions }));
    }
  }

  card.appendChild(list);
}

async function injectSeasonTeams(pathname: string | null) {
  const leagueId = getLeagueIdFromPathname(pathname);
  if (!leagueId) return;

  const card = findTeamsCard();
  if (!card) return;

  try {
    const response = await fetch(`/api/admin/leagues/${leagueId}/season-teams`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as Payload;
    renderTeamsCard(card, leagueId, payload);
  } catch {
    // Leave the server-rendered card in place if the enhancement fails.
  }
}

export default function AdminLeagueSeasonTeamsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/leagues/")) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void injectSeasonTeams(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 500);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
