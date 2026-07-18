// ========================================
// File: src/components/captain/InjuredPlayerAvailabilityBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SquadStatusPayload = {
  members?: Array<{
    id: string;
    squadStatus: "ACTIVE" | "INJURED";
    squadStatusNote: string | null;
  }>;
};

type PageContext = {
  teamId: string;
  page: "availability" | "selection";
};

function getPageContext(pathname: string): PageContext | null {
  const captainAvailability = pathname.match(/^\/captain\/team\/([^/]+)\/availability\/?$/);
  if (captainAvailability?.[1]) return { teamId: captainAvailability[1], page: "availability" };

  const adminAvailability = pathname.match(/^\/admin\/teams\/([^/]+)\/availability\/?$/);
  if (adminAvailability?.[1]) return { teamId: adminAvailability[1], page: "availability" };

  const selection = pathname.match(/^\/captain\/team\/([^/]+)\/fixtures\/[^/]+\/selection\/?$/);
  if (selection?.[1]) return { teamId: selection[1], page: "selection" };

  return null;
}

function findPlayerRow(input: HTMLInputElement) {
  let current: HTMLElement | null = input.closest("form");

  while (current && current !== document.body) {
    const className = typeof current.className === "string" ? current.className : "";
    if (className.includes("xl:grid-cols-") && className.includes("px-6") && className.includes("py-5")) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function addInjuredBadge(row: HTMLElement, note: string | null) {
  const name = row.querySelector<HTMLElement>(".text-base.font-semibold.text-white");
  const nameRow = name?.parentElement;
  if (!nameRow || nameRow.querySelector("[data-injured-player-badge]")) return;

  const badge = document.createElement("span");
  badge.dataset.injuredPlayerBadge = "true";
  badge.className =
    "rounded-full border border-red-400/40 bg-red-500/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-red-100";
  badge.textContent = "Injured — unavailable";
  badge.title = note?.trim() || "This player is marked injured and cannot be selected.";
  nameRow.appendChild(badge);
}

function markAvailabilityStatus(row: HTMLElement) {
  const name = row.querySelector<HTMLElement>(".text-base.font-semibold.text-white");
  const nameRow = name?.parentElement;
  if (!nameRow) return;

  const responseBadge = Array.from(nameRow.querySelectorAll<HTMLElement>("span")).find((badge) =>
    ["AVAILABLE", "MAYBE", "UNAVAILABLE", "NO RESPONSE"].includes(badge.textContent?.trim() ?? ""),
  );

  if (!responseBadge) return;
  responseBadge.className =
    "rounded-full border border-red-400/40 bg-red-500/20 px-2.5 py-1 text-[11px] font-bold text-red-100";
  responseBadge.textContent = "INJURED · UNAVAILABLE";
}

function addUnavailableNotice(row: HTMLElement, page: PageContext["page"], note: string | null) {
  if (row.querySelector("[data-injured-player-notice]")) return;

  const notice = document.createElement("div");
  notice.dataset.injuredPlayerNotice = "true";
  notice.className =
    "rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium leading-6 text-red-100";
  notice.textContent =
    page === "selection"
      ? "This player is marked injured and is not available for selection. Mark them available from the squad page before selecting them."
      : "This player is marked injured. Availability responses and SMS chases are disabled until they are marked available again.";

  if (note?.trim()) {
    const detail = document.createElement("div");
    detail.className = "mt-1 text-xs font-normal text-red-100/70";
    detail.textContent = `Injury note: ${note.trim()}`;
    notice.appendChild(detail);
  }

  const actionArea = Array.from(row.children).find((child) => {
    if (!(child instanceof HTMLElement)) return false;
    return child.querySelector('input[name="teamMemberId"]');
  });

  (actionArea instanceof HTMLElement ? actionArea : row).appendChild(notice);
}

function disableInjuredPlayerRow(input: {
  row: HTMLElement;
  page: PageContext["page"];
  note: string | null;
}) {
  const { row, page, note } = input;
  if (row.dataset.injuredPlayerLocked === "true") return;
  row.dataset.injuredPlayerLocked = "true";
  row.classList.add("border-l-4", "border-l-red-400", "bg-red-500/[0.06]");

  addInjuredBadge(row, note);
  if (page === "availability") markAvailabilityStatus(row);

  row.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
    if (!form.querySelector('input[name="teamMemberId"]')) return;

    const isAvailabilityResponse = Boolean(form.querySelector('[name="response"]'));
    const isSelectionForm = Boolean(form.querySelector('[name="selectionStatus"]'));
    const buttonText = form.querySelector("button")?.textContent?.trim().toLowerCase() ?? "";
    const isChaseForm = buttonText.includes("chase") || buttonText.includes("sms");

    if (isAvailabilityResponse || isSelectionForm || isChaseForm) {
      form.hidden = true;
      form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input, button, select, textarea",
      ).forEach((control) => {
        control.disabled = true;
      });
    }
  });

  addUnavailableNotice(row, page, note);
}

function applyStatuses(context: PageContext, injuredMembers: Map<string, string | null>) {
  document.querySelectorAll<HTMLInputElement>('input[name="teamMemberId"]').forEach((input) => {
    const memberId = input.value.trim();
    if (!injuredMembers.has(memberId)) return;

    const row = findPlayerRow(input);
    if (!row) return;

    disableInjuredPlayerRow({
      row,
      page: context.page,
      note: injuredMembers.get(memberId) ?? null,
    });
  });
}

export default function InjuredPlayerAvailabilityBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const context = getPageContext(pathname);
    if (!context) return;

    const controller = new AbortController();
    const timers: number[] = [];

    void fetch(`/api/captain/team/${encodeURIComponent(context.teamId)}/squad-status`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Injury status could not be loaded.");
        return (await response.json()) as SquadStatusPayload;
      })
      .then((payload) => {
        const injuredMembers = new Map(
          (payload.members ?? [])
            .filter((member) => member.squadStatus === "INJURED")
            .map((member) => [member.id, member.squadStatusNote] as const),
        );

        const run = () => applyStatuses(context, injuredMembers);
        run();
        timers.push(window.setTimeout(run, 250));
        timers.push(window.setTimeout(run, 800));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Could not apply injured player restrictions", error);
      });

    return () => {
      controller.abort();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [pathname]);

  return null;
}
