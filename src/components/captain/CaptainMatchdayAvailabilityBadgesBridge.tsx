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

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/captain\/team\/([^/]+)\/match-fees\/?$/);
  return match?.[1] ?? null;
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
