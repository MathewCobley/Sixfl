// ========================================
// File: src/components/captain/CaptainMatchdayAvailabilityBadgesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type AvailabilityResponse = "AVAILABLE" | "MAYBE" | "UNAVAILABLE" | "NO_RESPONSE";

type AvailabilityRow = {
  teamMemberId: string;
  response: AvailabilityResponse;
  note: string | null;
  respondedAt: string | null;
};

const CAPTAIN_NAV_LINK_CLASS =
  "inline-flex shrink-0 items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white";

const MANAGED_ONLY_MATCHDAY_WARNING =
  "This team is currently set as a standard team. Matchday player selection is intended for managed SIXFL squads.";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/captain\/team\/([^/]+)\/match-fees\/?$/);
  return match?.[1] ?? null;
}

function getCaptainTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/captain\/team\/([^/]+)(?:\/.*)?$/);
  return match?.[1] ?? null;
}

function ensureMatchdaySquadNavLink(pathname: string) {
  const teamId = getCaptainTeamIdFromPathname(pathname);
  if (!teamId) return;

  const nav = document.querySelector<HTMLElement>(".captain-team-nav");
  if (!nav) return;

  const matchdayHref = `/captain/team/${teamId}/match-fees`;
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>("a"));

  if (links.some((link) => link.getAttribute("href") === matchdayHref)) {
    return;
  }

  const matchdayLink = document.createElement("a");
  matchdayLink.href = matchdayHref;
  matchdayLink.textContent = "Matchday squad";
  matchdayLink.className = CAPTAIN_NAV_LINK_CLASS;

  const squadPaymentsLink = links.find(
    (link) => link.textContent?.trim() === "Squad payments",
  );
  const availabilityLink = links.find(
    (link) => link.textContent?.trim() === "Availability",
  );

  if (squadPaymentsLink?.nextSibling) {
    nav.insertBefore(matchdayLink, squadPaymentsLink.nextSibling);
    return;
  }

  if (availabilityLink) {
    nav.insertBefore(matchdayLink, availabilityLink);
    return;
  }

  nav.appendChild(matchdayLink);
}

function removeManagedOnlyMatchdayWarning() {
  document.querySelectorAll<HTMLElement>("div").forEach((element) => {
    if (element.textContent?.trim() === MANAGED_ONLY_MATCHDAY_WARNING) {
      element.remove();
    }
  });
}

function getBadgeClasses(response: AvailabilityResponse) {
  switch (response) {
    case "AVAILABLE":
      return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
    case "MAYBE":
      return "border-amber-400/25 bg-amber-500/10 text-amber-100";
    case "UNAVAILABLE":
      return "border-red-400/25 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/[0.04] text-white/55";
  }
}

function getBadgeLabel(response: AvailabilityResponse) {
  switch (response) {
    case "AVAILABLE":
      return "Availability: Available";
    case "MAYBE":
      return "Availability: Maybe";
    case "UNAVAILABLE":
      return "Availability: Unavailable";
    default:
      return "Availability: No response";
  }
}

function addAvailabilityBadges(rows: AvailabilityRow[]) {
  const availabilityByMemberId = new Map(rows.map((row) => [row.teamMemberId, row]));

  document
    .querySelectorAll<HTMLInputElement>('input[name="player"][value^="member:"]')
    .forEach((input) => {
      const memberId = input.value.replace(/^member:/, "");
      const label = input.closest("label");
      if (!label || !memberId) return;

      const existingBadge = label.querySelector<HTMLElement>("[data-matchday-availability-badge]");
      existingBadge?.remove();

      const availability = availabilityByMemberId.get(memberId);
      const response = availability?.response ?? "NO_RESPONSE";
      const playerTextWrapper = input.nextElementSibling as HTMLElement | null;
      const playerName = playerTextWrapper?.querySelector("span") as HTMLElement | null;
      const insertTarget = playerName?.parentElement ?? playerTextWrapper ?? label;

      const badge = document.createElement("span");
      badge.dataset.matchdayAvailabilityBadge = "true";
      badge.className = `mt-1 inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-medium ${getBadgeClasses(response)}`;
      badge.textContent = getBadgeLabel(response);

      if (availability?.note) {
        badge.title = availability.note;
      }

      if (playerName) {
        playerName.insertAdjacentElement("afterend", badge);
      } else {
        insertTarget.appendChild(badge);
      }

      if (response === "UNAVAILABLE") {
        label.classList.add("border-red-400/25", "bg-red-500/5");
      }
    });
}

export default function CaptainMatchdayAvailabilityBadgesBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fixtureId = searchParams.get("fixtureId");

  useEffect(() => {
    const teamId = getCaptainTeamIdFromPathname(pathname);
    if (!teamId) return;

    const installMatchdayEnhancements = () => {
      ensureMatchdaySquadNavLink(pathname);
      removeManagedOnlyMatchdayWarning();
    };

    const frame = window.requestAnimationFrame(installMatchdayEnhancements);
    const observer = new MutationObserver(installMatchdayEnhancements);

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    const teamId = getTeamIdFromPathname(pathname);

    if (!teamId || !fixtureId) return;

    let cancelled = false;

    async function loadAvailability() {
      try {
        const response = await fetch(
          `/api/captain/team/${teamId}/fixture/${fixtureId}/availability`,
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const payload = (await response.json()) as { availabilities?: AvailabilityRow[] };

        if (!cancelled) {
          addAvailabilityBadges(payload.availabilities ?? []);
        }
      } catch {
        // Non-blocking UI enhancement only.
      }
    }

    const frame = window.requestAnimationFrame(loadAvailability);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [pathname, fixtureId]);

  return null;
}
