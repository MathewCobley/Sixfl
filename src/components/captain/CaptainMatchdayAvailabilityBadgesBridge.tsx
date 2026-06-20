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

const oldOptionalSelectionMessage =
  "This team is currently set as a standard team. Matchday player selection is intended for managed SIXFL squads.";

const captainFriendlyOptionalSelectionMessage =
  "This is optional for your team. Use it if you want to record who actually played and help manage individual match fees. If you only collect one team payment, you can ignore this page.";

const captainFriendlyTextReplacements: Array<[string, string]> = [
  [oldOptionalSelectionMessage, captainFriendlyOptionalSelectionMessage],
  [
    "Tick this when the player uses WhatsApp, so captains know payment links can be sent that way.",
    "Tick this when the player uses WhatsApp, so you know payment links can be shared that way.",
  ],
  [
    "These details help captains send payment links and organise matchday squads.",
    "These details help you share payment links and organise matchday squads.",
  ],
  [
    "Standard team",
    "Your team",
  ],
  [
    "Managed team",
    "SIXFL-supported team",
  ],
  [
    "SIXFL-managed",
    "SIXFL-supported",
  ],
  [
    "This team is currently managed by SIXFL. Automated player availability reminders may still be handled through the managed squad tools. WhatsApp templates are mainly intended for standard captains who manage their own squad group.",
    "SIXFL may already help with availability reminders for this team. You can still use these WhatsApp templates if you want to share messages in your own team group.",
  ],
];

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

function rewriteCaptainFriendlyCopy() {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    let nextValue = node.nodeValue ?? "";

    for (const [from, to] of captainFriendlyTextReplacements) {
      if (nextValue.includes(from)) {
        nextValue = nextValue.split(from).join(to);
      }
    }

    if (nextValue !== node.nodeValue) {
      node.nodeValue = nextValue;
    }
  }

  const candidates = Array.from(document.querySelectorAll<HTMLElement>("main div, main section, main p"));

  for (const candidate of candidates) {
    if (candidate.textContent?.trim() === captainFriendlyOptionalSelectionMessage) {
      candidate.classList.remove("text-amber-100");
      candidate.classList.add("text-emerald-100");
      candidate.classList.remove("border-amber-400/20", "bg-amber-500/10");
      candidate.classList.add("border-emerald-400/20", "bg-emerald-500/10");
    }
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
    let cancelled = false;
    const teamId = getTeamIdFromPathname(pathname);

    function runCopyRewrite() {
      if (!cancelled) rewriteCaptainFriendlyCopy();
    }

    runCopyRewrite();

    const root = document.querySelector(".captain-team-shell") ?? document.body;
    const observer = new MutationObserver(runCopyRewrite);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    async function loadAvailability() {
      if (!teamId || !fixtureId) return;

      try {
        const response = await fetch(
          `/api/captain/team/${teamId}/fixture/${fixtureId}/availability`,
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const payload = (await response.json()) as { availabilities?: AvailabilityRow[] };

        if (!cancelled) {
          addAvailabilityBadges(payload.availabilities ?? []);
          rewriteCaptainFriendlyCopy();
        }
      } catch {
        // Non-blocking UI enhancement only.
      }
    }

    const frame = window.requestAnimationFrame(loadAvailability);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [pathname, fixtureId]);

  return null;
}
