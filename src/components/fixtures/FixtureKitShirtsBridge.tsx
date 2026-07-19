"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const DEFAULT_KIT_COLOUR = "#64748B";
const FIXTURE_PATH_PATTERN =
  /(?:\/fixtures?(?:\/|$)|\/results?(?:\/|$)|\/referee\/fixture|\/admin\/night-board|\/admin\/fixtures)/i;
const CAPTAIN_PATH_PATTERN = /^\/captain\/team\//i;

type KitTeam = {
  id: string;
  name: string;
  colour: string | null;
};

type KitColourResponse = {
  teams?: KitTeam[];
};

function normaliseName(value: string) {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createShirtIcon(team: KitTeam) {
  const icon = document.createElement("span");
  const colour = team.colour || DEFAULT_KIT_COLOUR;

  icon.dataset.sixflKitShirt = "1";
  icon.dataset.sixflKitTeam = normaliseName(team.name);
  icon.setAttribute("aria-hidden", "true");
  icon.title = `${team.name} shirt colour`;
  icon.style.display = "inline-block";
  icon.style.width = "1.05em";
  icon.style.height = "0.92em";
  icon.style.marginRight = "0.34em";
  icon.style.verticalAlign = "-0.08em";
  icon.style.flex = "0 0 auto";
  icon.style.backgroundColor = colour;
  icon.style.clipPath =
    "polygon(20% 0,34% 0,40% 13%,60% 13%,66% 0,80% 0,100% 24%,84% 42%,77% 33%,77% 100%,23% 100%,23% 33%,16% 42%,0 24%)";
  icon.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,0.7))";

  if (colour.toUpperCase() === "#FFFFFF") {
    icon.style.outline = "1px solid rgba(148,163,184,0.8)";
    icon.style.outlineOffset = "-1px";
  }

  return icon;
}

function isIgnoredTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;

  return Boolean(
    parent.closest(
      "script,style,noscript,textarea,input,select,option,[data-sixfl-kit-shirt],[data-sixfl-kit-team-label],[data-sixfl-kit-colour-picker],nav,header",
    ),
  );
}

function hasFixtureContext(node: Text, pathname: string, teamName: string) {
  const parent = node.parentElement;
  if (!parent) return false;

  const directText = node.data.trim();
  const fixtureHeavyPath = FIXTURE_PATH_PATTERN.test(pathname);
  const captainPath = CAPTAIN_PATH_PATTERN.test(pathname);

  let current: HTMLElement | null = parent;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const href = current instanceof HTMLAnchorElement ? current.href : "";

    if (
      /\bvs?\.?\b/i.test(text) ||
      /\bfixture\b|\bkick-?off\b|\bopponent\b|\bnext up\b|\bmatch list\b/i.test(text) ||
      /\b\d+\s*[-–:]\s*\d+\b/.test(text) ||
      /\/fixtures?|\/results?|\/fixture\//i.test(href)
    ) {
      return true;
    }

    current = current.parentElement;
  }

  if (fixtureHeavyPath && directText.toLowerCase().includes(teamName.toLowerCase())) {
    return true;
  }

  if (captainPath && directText.toLowerCase() === teamName.toLowerCase()) {
    return true;
  }

  return false;
}

function decorateTextNode(node: Text, teams: KitTeam[], pathname: string) {
  if (!node.data.trim() || isIgnoredTextNode(node)) return;

  const matchingTeams = teams.filter(
    (team) =>
      team.name.trim() &&
      node.data.toLowerCase().includes(team.name.trim().toLowerCase()) &&
      hasFixtureContext(node, pathname, team.name),
  );

  if (matchingTeams.length === 0) return;

  const teamsByName = new Map(
    matchingTeams.map((team) => [normaliseName(team.name), team]),
  );
  const names = [...teamsByName.values()]
    .map((team) => team.name.trim())
    .sort((a, b) => b.length - a.length);
  const matcher = new RegExp(`(${names.map(escapeRegExp).join("|")})`, "gi");
  const pieces = node.data.split(matcher);

  if (pieces.length < 2) return;

  const fragment = document.createDocumentFragment();

  for (const piece of pieces) {
    const team = teamsByName.get(normaliseName(piece));

    if (!team) {
      fragment.appendChild(document.createTextNode(piece));
      continue;
    }

    const label = document.createElement("span");
    label.dataset.sixflKitTeamLabel = normaliseName(team.name);
    label.style.display = "inline-flex";
    label.style.alignItems = "baseline";
    label.style.whiteSpace = "nowrap";
    label.appendChild(createShirtIcon(team));
    label.appendChild(document.createTextNode(piece));
    fragment.appendChild(label);
  }

  node.parentNode?.replaceChild(fragment, node);
}

function updateExistingIcons(teams: KitTeam[]) {
  const colours = new Map(
    teams.map((team) => [normaliseName(team.name), team.colour || DEFAULT_KIT_COLOUR]),
  );

  document.querySelectorAll<HTMLElement>("[data-sixfl-kit-shirt]").forEach((icon) => {
    const teamName = icon.dataset.sixflKitTeam ?? "";
    const colour = colours.get(teamName) ?? DEFAULT_KIT_COLOUR;
    icon.style.backgroundColor = colour;
    icon.style.outline = colour.toUpperCase() === "#FFFFFF"
      ? "1px solid rgba(148,163,184,0.8)"
      : "none";
  });
}

function decoratePage(teams: KitTeam[], pathname: string) {
  if (teams.length === 0) return;

  updateExistingIcons(teams);

  const root = document.querySelector("main") ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    decorateTextNode(node, teams, pathname);
  }
}

async function loadKitColours() {
  const response = await fetch("/api/team-kit-colours", { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as KitColourResponse;
  return data.teams ?? [];
}

export default function FixtureKitShirtsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let teams: KitTeam[] = [];

    const scheduleDecorate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => decoratePage(teams, pathname), 40);
    };

    const refresh = async () => {
      const nextTeams = await loadKitColours();
      if (cancelled) return;
      teams = nextTeams;
      scheduleDecorate();
    };

    void refresh();

    observer = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE ||
            (node instanceof HTMLElement && !node.dataset.sixflKitShirt),
        ),
      );

      if (hasRelevantMutation) scheduleDecorate();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("sixfl:kit-colours-updated", refresh);

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      window.removeEventListener("sixfl:kit-colours-updated", refresh);
    };
  }, [pathname]);

  return null;
}
