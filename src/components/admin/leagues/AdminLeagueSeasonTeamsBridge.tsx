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
  canEnterSeason?: boolean;
  affiliationLabel?: string;
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
  affiliatedTeams?: SeasonTeam[];
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

function divisionButtonClass(active: boolean) {
  return active
    ? "rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-50"
    : "rounded-xl border border-white/10 bg-[#0d1428] px-3 py-2 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:text-white";
}

function removeButtonClass() {
  return "rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15";
}

function enterButtonClass() {
  return "rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15";
}

function createTeamIdentity(team: SeasonTeam) {
  const link = document.createElement("a");
  link.href = `/admin/teams/${team.teamId}`;
  link.className = "flex min-w-0 items-center gap-3 transition hover:text-emerald-300";

  const badge = document.createElement("div");
  badge.className = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30 text-xs font-black text-white/70";
  badge.textContent = getInitials(team.teamName);

  const text = document.createElement("div");
  text.className = "min-w-0";
  const name = document.createElement("div");
  name.className = "truncate text-sm font-medium text-white";
  name.textContent = team.teamName;
  const contact = document.createElement("div");
  contact.className = "truncate text-xs text-white/45";
  contact.textContent = `${team.contactEmail || "No email"} · ${team.contactPhone || "No phone"}`;
  text.append(name, contact);
  link.append(badge, text);

  return link;
}

async function sendSeasonTeamRequest(input: {
  leagueId: string;
  teamId: string;
  method: "POST" | "DELETE";
  divisionId?: string | null;
}) {
  const response = await fetch(`/api/admin/leagues/${input.leagueId}/season-teams`, {
    method: input.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      teamId: input.teamId,
      ...(input.method === "POST" ? { divisionId: input.divisionId ?? null } : {}),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "The season membership could not be updated.");
  }
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
  const link = createTeamIdentity(input.team);

  const controls = document.createElement("div");
  controls.className = "flex flex-wrap gap-2 lg:justify-end";

  const options = [{ id: "", name: "No division" }, ...input.divisions];
  for (const division of options) {
    const active = (input.team.divisionId ?? "") === division.id;
    const button = document.createElement("button");
    button.type = "button";
    button.className = divisionButtonClass(active);
    button.textContent = division.name;
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Saving…";

      try {
        await sendSeasonTeamRequest({
          leagueId: input.leagueId,
          teamId: input.team.teamId,
          method: "POST",
          divisionId: division.id || null,
        });
        window.location.reload();
      } catch (error) {
        button.disabled = false;
        button.textContent = error instanceof Error ? error.message : "Could not save";
      }
    });
    controls.appendChild(button);
  }

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = removeButtonClass();
  removeButton.textContent = "Make affiliated only";
  removeButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `Remove ${input.team.teamName} from this season? The team will remain affiliated, retain its captain account and PlayerPool access, and can still receive league communications.`,
    );

    if (!confirmed) return;

    removeButton.disabled = true;
    removeButton.textContent = "Updating…";

    try {
      await sendSeasonTeamRequest({
        leagueId: input.leagueId,
        teamId: input.team.teamId,
        method: "DELETE",
      });
      window.location.reload();
    } catch (error) {
      removeButton.disabled = false;
      removeButton.textContent = error instanceof Error ? error.message : "Could not update";
    }
  });
  controls.appendChild(removeButton);

  layout.append(link, controls);
  row.appendChild(layout);
  return row;
}

function renderAffiliatedTeamRow(input: {
  leagueId: string;
  team: SeasonTeam;
}) {
  const row = document.createElement("div");
  row.className = "rounded-2xl border border-sky-400/15 bg-sky-500/[0.05] p-4";

  const layout = document.createElement("div");
  layout.className = "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between";
  const link = createTeamIdentity(input.team);

  if (input.team.canEnterSeason === false) {
    const status = document.createElement("div");
    status.className = "rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-right";

    const label = document.createElement("div");
    label.className = "text-xs font-semibold text-sky-100";
    label.textContent = input.team.affiliationLabel || "Communications only";

    const helper = document.createElement("div");
    helper.className = "mt-0.5 text-[11px] text-white/45";
    helper.textContent = "No league · cannot enter a season or division here";

    status.append(label, helper);
    layout.append(link, status);
    row.appendChild(layout);
    return row;
  }

  const enterButton = document.createElement("button");
  enterButton.type = "button";
  enterButton.className = enterButtonClass();
  enterButton.textContent = "Enter current season";
  enterButton.addEventListener("click", async () => {
    enterButton.disabled = true;
    enterButton.textContent = "Adding…";

    try {
      await sendSeasonTeamRequest({
        leagueId: input.leagueId,
        teamId: input.team.teamId,
        method: "POST",
        divisionId: null,
      });
      window.location.reload();
    } catch (error) {
      enterButton.disabled = false;
      enterButton.textContent = error instanceof Error ? error.message : "Could not add";
    }
  });

  layout.append(link, enterButton);
  row.appendChild(layout);
  return row;
}

function renderTeamsCard(card: HTMLElement, leagueId: string, payload: Payload) {
  if (card.dataset.seasonTeamsRendered === leagueId) return;
  card.dataset.seasonTeamsRendered = leagueId;

  const teams = payload.teams ?? [];
  const affiliatedTeams = payload.affiliatedTeams ?? [];
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
  desc.textContent = `${teams.length} active team${teams.length === 1 ? "" : "s"} in ${payload.league?.season || "this season"}. Only these teams appear in fixtures, season counts and the league table.`;
  copy.append(title, desc);

  const add = document.createElement("a");
  add.href = "/admin/teams/new";
  add.className = "inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/15";
  add.textContent = "Create new team";

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

  const affiliatedSection = document.createElement("section");
  affiliatedSection.className = "mt-7 border-t border-white/10 pt-6";

  const affiliatedTitle = document.createElement("h3");
  affiliatedTitle.className = "text-base font-semibold text-white";
  affiliatedTitle.textContent = "Affiliated teams not in this season";

  const affiliatedDesc = document.createElement("p");
  affiliatedDesc.className = "mt-1 text-sm leading-6 text-white/55";
  affiliatedDesc.textContent = `${affiliatedTeams.length} affiliated team${affiliatedTeams.length === 1 ? "" : "s"}. They keep captain access, PlayerPool access and league communications, but stay out of fixtures and the table.`;

  const affiliatedList = document.createElement("div");
  affiliatedList.className = "mt-4 space-y-3";

  if (affiliatedTeams.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/50";
    empty.textContent = "No affiliated-only teams at the moment.";
    affiliatedList.appendChild(empty);
  } else {
    for (const team of affiliatedTeams) {
      affiliatedList.appendChild(renderAffiliatedTeamRow({ leagueId, team }));
    }
  }

  affiliatedSection.append(affiliatedTitle, affiliatedDesc, affiliatedList);
  card.appendChild(affiliatedSection);
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
