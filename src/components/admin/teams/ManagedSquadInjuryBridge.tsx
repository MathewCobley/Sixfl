// ========================================
// File: src/components/admin/teams/ManagedSquadInjuryBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SquadStatus = "ACTIVE" | "INJURED";

type MemberStatus = {
  id: string;
  squadStatus: SquadStatus;
  squadStatusUpdatedAt: string | null;
  squadStatusNote: string | null;
};

type StatusPayload = {
  members?: MemberStatus[];
};

function getPageContext(pathname: string) {
  const adminMatch = pathname.match(/^\/admin\/teams\/([^/]+)\/squad\/?$/);
  if (adminMatch?.[1]) return { teamId: adminMatch[1], mode: "admin" as const };

  const captainMatch = pathname.match(/^\/captain\/team\/([^/]+)\/squad\/?$/);
  if (captainMatch?.[1]) return { teamId: captainMatch[1], mode: "captain" as const };

  return null;
}

function getMembershipIdFromHref(href: string, teamId: string) {
  const adminMatch = href.match(new RegExp(`/admin/teams/${teamId}/players/([^/]+)/(?:preview|communications)`));
  if (adminMatch?.[1]) return adminMatch[1];

  const captainMatch = href.match(new RegExp(`/captain/team/${teamId}/squad/([^/]+)/edit`));
  if (captainMatch?.[1]) return captainMatch[1];

  return null;
}

async function loadStatuses(teamId: string) {
  const response = await fetch(`/api/admin/managed-squad-status?teamId=${encodeURIComponent(teamId)}`, {
    cache: "no-store",
  });

  if (!response.ok) return new Map<string, MemberStatus>();
  const payload = (await response.json().catch(() => null)) as StatusPayload | null;
  return new Map((payload?.members ?? []).map((member) => [member.id, member]));
}

async function updateStatus(input: {
  teamId: string;
  membershipId: string;
  squadStatus: SquadStatus;
  note?: string | null;
}) {
  const response = await fetch("/api/admin/managed-squad-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Could not update injury status.");
  }
}

function findActionContainer(link: HTMLAnchorElement) {
  let current: HTMLElement | null = link.parentElement;

  for (let depth = 0; current && depth < 5; depth += 1) {
    const linkCount = current.querySelectorAll("a[href], button").length;
    if (linkCount >= 2) return current;
    current = current.parentElement;
  }

  return link.parentElement;
}

function createStatusButton(input: {
  teamId: string;
  membershipId: string;
  currentStatus: SquadStatus;
}) {
  const isInjured = input.currentStatus === "INJURED";
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.managedSquadInjuryButton = "true";
  button.className = [
    "inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-center text-sm font-medium transition sm:w-auto",
    isInjured
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
      : "border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15",
  ].join(" ");
  button.textContent = isInjured ? "Mark available" : "Injured";
  button.title = isInjured
    ? "Mark this player available for future availability chases."
    : "Mark this player injured so future availability chases stop.";

  button.addEventListener("click", async () => {
    const nextStatus: SquadStatus = isInjured ? "ACTIVE" : "INJURED";
    const note = nextStatus === "INJURED" ? window.prompt("Optional injury note", "") : null;

    button.disabled = true;
    button.textContent = nextStatus === "INJURED" ? "Marking injured..." : "Marking available...";

    try {
      await updateStatus({
        teamId: input.teamId,
        membershipId: input.membershipId,
        squadStatus: nextStatus,
        note,
      });
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update injury status.");
      button.disabled = false;
      button.textContent = isInjured ? "Mark available" : "Injured";
    }
  });

  return button;
}

function addStatusBadge(link: HTMLAnchorElement, status: MemberStatus | undefined) {
  if (status?.squadStatus !== "INJURED") return;

  const card = link.closest("div.flex.flex-col.gap-5") ?? link.closest("div.px-6.py-5");
  if (!card || card.querySelector("[data-managed-squad-injury-badge='true']")) return;

  const nameRow = card.querySelector("div.flex.flex-wrap.items-center.gap-2");
  if (!nameRow) return;

  const badge = document.createElement("span");
  badge.dataset.managedSquadInjuryBadge = "true";
  badge.className = "rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-100";
  badge.textContent = "Injured — no chases";
  if (status.squadStatusNote) badge.title = status.squadStatusNote;
  nameRow.appendChild(badge);
}

function injectButtons(teamId: string, statuses: Map<string, MemberStatus>) {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((link) =>
    Boolean(getMembershipIdFromHref(link.getAttribute("href") ?? "", teamId)),
  );

  const handled = new Set<string>();

  for (const link of links) {
    const membershipId = getMembershipIdFromHref(link.getAttribute("href") ?? "", teamId);
    if (!membershipId || handled.has(membershipId)) continue;
    handled.add(membershipId);

    const status = statuses.get(membershipId);
    const actionContainer = findActionContainer(link);
    if (!actionContainer || actionContainer.querySelector(`[data-managed-squad-injury-member='${membershipId}']`)) {
      addStatusBadge(link, status);
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.dataset.managedSquadInjuryMember = membershipId;
    wrapper.className = "w-full sm:w-auto";
    wrapper.appendChild(createStatusButton({
      teamId,
      membershipId,
      currentStatus: status?.squadStatus ?? "ACTIVE",
    }));

    actionContainer.appendChild(wrapper);
    addStatusBadge(link, status);
  }
}

export default function ManagedSquadInjuryBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const context = getPageContext(pathname);
    if (!context) return;

    let cancelled = false;
    let statusMap = new Map<string, MemberStatus>();

    void loadStatuses(context.teamId).then((loadedStatuses) => {
      if (cancelled) return;
      statusMap = loadedStatuses;
      injectButtons(context.teamId, statusMap);
    });

    const observer = new MutationObserver(() => {
      if (!cancelled) injectButtons(context.teamId, statusMap);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
