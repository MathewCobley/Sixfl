// ========================================
// File: src/components/captain/CaptainFixtureBadgesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type FixtureBadgeTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
};

type FixtureBadge = {
  id: string;
  homeTeam: FixtureBadgeTeam;
  awayTeam: FixtureBadgeTeam;
  fullLabel: string;
  captainLabel: string;
};

type FixtureBadgesPayload = {
  fixtures?: FixtureBadge[];
};

function getTeamInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function createBadge(team: FixtureBadgeTeam, size: "sm" | "lg") {
  const badge = document.createElement("span");
  badge.className = [
    "inline-flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-black/35 shadow-[0_8px_24px_rgba(0,0,0,0.22)]",
    size === "lg" ? "h-14 w-14 rounded-2xl" : "h-9 w-9 rounded-xl",
  ].join(" ");
  badge.setAttribute("aria-label", `${team.name} badge`);

  if (team.logoUrl) {
    const image = document.createElement("img");
    image.src = team.logoUrl;
    image.alt = `${team.name} badge`;
    image.className = "h-full w-full object-cover";
    badge.appendChild(image);
  } else {
    const initials = document.createElement("span");
    initials.className =
      size === "lg"
        ? "text-sm font-black text-white/70"
        : "text-[11px] font-black text-white/70";
    initials.textContent = getTeamInitials(team.name);
    badge.appendChild(initials);
  }

  return badge;
}

function createTeamLabel(team: FixtureBadgeTeam, size: "sm" | "lg") {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-flex min-w-0 items-center gap-2";
  wrapper.dataset.fixtureBadgeInjected = "true";

  const name = document.createElement("span");
  name.className = "min-w-0";
  name.textContent = team.name;

  wrapper.appendChild(createBadge(team, size));
  wrapper.appendChild(name);

  return wrapper;
}

function createFullFixtureLabel(fixture: FixtureBadge, size: "sm" | "lg") {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2";
  wrapper.dataset.fixtureBadgeInjected = "true";

  const separator = document.createElement("span");
  separator.className = "text-white/55";
  separator.textContent = "vs";

  wrapper.appendChild(createTeamLabel(fixture.homeTeam, size));
  wrapper.appendChild(separator);
  wrapper.appendChild(createTeamLabel(fixture.awayTeam, size));

  return wrapper;
}

function createCaptainFixtureLabel(fixture: FixtureBadge, size: "sm" | "lg") {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2";
  wrapper.dataset.fixtureBadgeInjected = "true";

  const isHomeLabel = fixture.captainLabel === `vs ${fixture.awayTeam.name}`;
  const opponent = isHomeLabel ? fixture.awayTeam : fixture.homeTeam;

  const separator = document.createElement("span");
  separator.className = "text-white/55";
  separator.textContent = "vs";

  wrapper.appendChild(separator);
  wrapper.appendChild(createTeamLabel(opponent, size));

  return wrapper;
}

function findMatchingFixture(text: string, fixtures: FixtureBadge[]) {
  const normalisedText = text.replace(/\s+/g, " ").trim();

  return (
    fixtures.find((fixture) => {
      const fullLabel = fixture.fullLabel.replace(/\s+/g, " ").trim();
      const captainLabel = fixture.captainLabel.replace(/\s+/g, " ").trim();

      return normalisedText === fullLabel || normalisedText === captainLabel;
    }) ?? null
  );
}

function injectFixtureBadges(fixtures: FixtureBadge[]) {
  if (fixtures.length === 0) return;

  const headingCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "h2, div.text-base.font-semibold.text-white, div.font-semibold.text-white",
    ),
  );

  for (const element of headingCandidates) {
    const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text.includes(" vs ") && !text.startsWith("vs ")) continue;

    const fixture = findMatchingFixture(text, fixtures);
    if (!fixture) continue;

    const size = element.tagName === "H2" ? "lg" : "sm";
    element.textContent = "";
    element.classList.add("flex", "items-center", "gap-3");
    element.dataset.fixtureBadgeProcessed = "true";

    const label = text === fixture.fullLabel
      ? createFullFixtureLabel(fixture, size)
      : createCaptainFixtureLabel(fixture, size);

    element.appendChild(label);
  }
}

async function loadFixtureBadges(teamId: string) {
  const response = await fetch(`/api/captain/team/${teamId}/fixture-badges`, {
    cache: "no-store",
  });

  if (!response.ok) return [];

  const payload = (await response.json().catch(() => null)) as FixtureBadgesPayload | null;
  return payload?.fixtures ?? [];
}

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export default function CaptainFixtureBadgesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);
    if (!teamId) return;
    if (!pathname.startsWith(`/captain/team/${teamId}`)) return;

    let cancelled = false;
    let fixtures: FixtureBadge[] = [];

    void loadFixtureBadges(teamId).then((loadedFixtures) => {
      if (cancelled) return;
      fixtures = loadedFixtures;
      injectFixtureBadges(fixtures);
    });

    const observer = new MutationObserver(() => {
      if (fixtures.length > 0) {
        injectFixtureBadges(fixtures);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
