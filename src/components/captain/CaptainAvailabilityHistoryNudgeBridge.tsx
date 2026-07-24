// ========================================
// File: src/components/captain/CaptainAvailabilityHistoryNudgeBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type NudgePlayer = {
  teamMemberId: string;
  email: string | null;
  lastNudgeAt: string | null;
  nudgeStatus: string | null;
  nudgeCount: number;
};

type NudgePayload = {
  players?: NudgePlayer[];
  error?: string;
};

type NudgeSendPayload = {
  error?: string;
  teamMemberId?: string;
  lastNudgeAt?: string | null;
  nudgeStatus?: string | null;
  nudgeCount?: number;
};

const DECORATED_ATTR = "data-availability-nudge-decorated";
const STATUS_ATTR = "data-availability-nudge-status";

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

function getTeamId(pathname: string) {
  const match = pathname.match(
    /^\/captain\/team\/([^/]+)\/availability\/history\/?$/,
  );
  return match?.[1] ?? null;
}

function formatNudgeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatStatus(value: string | null) {
  switch (value) {
    case "SENT":
      return "sent";
    case "QUEUED":
      return "queued";
    case "PROCESSING":
      return "sending";
    case "FAILED":
      return "failed";
    case "SKIPPED":
      return "skipped";
    case "CANCELLED":
      return "cancelled";
    default:
      return null;
  }
}

function getStatusText(player: NudgePlayer) {
  if (!player.lastNudgeAt) return "No availability nudge sent yet";

  const status = formatStatus(player.nudgeStatus);
  const countLabel =
    player.nudgeCount > 1 ? ` · ${player.nudgeCount} nudges` : "";

  return `Last nudge: ${formatNudgeDate(player.lastNudgeAt)}${
    status ? ` · ${status}` : ""
  }${countLabel}`;
}

function findHistoryTable() {
  return Array.from(document.querySelectorAll<HTMLTableElement>("table")).find(
    (table) => {
      const text = table.textContent ?? "";
      return text.includes("Response rate") && text.includes("Last response");
    },
  );
}

function getEmailFromCell(cell: HTMLTableCellElement) {
  const candidates = Array.from(cell.querySelectorAll<HTMLElement>("div, span"));
  const matching = candidates.find((element) =>
    (element.textContent ?? "").includes("@"),
  );
  return matching?.textContent?.trim() ?? null;
}

function getIgnoredCount(row: HTMLTableRowElement) {
  const cells = row.querySelectorAll<HTMLTableCellElement>("td");
  const value = Number(cells[3]?.textContent?.trim() ?? "0");
  return Number.isFinite(value) ? value : 0;
}

function updateStatus(cell: HTMLTableCellElement, player: NudgePlayer) {
  let status = cell.querySelector<HTMLElement>(`[${STATUS_ATTR}]`);

  if (!status) {
    status = document.createElement("div");
    status.setAttribute(STATUS_ATTR, "true");
    status.className = "mt-2 text-[11px] text-amber-100/70";
    cell.appendChild(status);
  }

  status.textContent = getStatusText(player);
}

function createNudgeButton(input: {
  teamId: string;
  player: NudgePlayer;
  cell: HTMLTableCellElement;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "inline-flex min-h-8 items-center justify-center rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50";
  button.textContent = input.player.lastNudgeAt ? "Nudge again" : "Send nudge";
  button.title = "Email this player about missing availability responses";

  button.addEventListener("click", async () => {
    const email = input.player.email ?? "this player";
    const confirmed = window.confirm(
      `Send an availability warning email to ${email}?`,
    );
    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Sending…";

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(
          input.teamId,
        )}/availability-history-nudges`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamMemberId: input.player.teamMemberId }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | NudgeSendPayload
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "The nudge could not be sent.");
      }

      if (!payload.lastNudgeAt || typeof payload.nudgeCount !== "number") {
        throw new Error("The nudge was queued, but its audit date could not be loaded.");
      }

      input.player.lastNudgeAt = payload.lastNudgeAt;
      input.player.nudgeStatus = payload.nudgeStatus ?? null;
      input.player.nudgeCount = payload.nudgeCount;
      updateStatus(input.cell, input.player);
      button.textContent = "Nudge again";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The nudge could not be sent.";
      let status = input.cell.querySelector<HTMLElement>(`[${STATUS_ATTR}]`);
      if (!status) {
        status = document.createElement("div");
        status.setAttribute(STATUS_ATTR, "true");
        status.className = "mt-2 text-[11px] text-red-200";
        input.cell.appendChild(status);
      }
      status.textContent = message;
      button.textContent = input.player.lastNudgeAt ? "Nudge again" : "Send nudge";
    } finally {
      button.disabled = false;
    }
  });

  return button;
}

function decorateHistoryRows(input: {
  teamId: string;
  playersByEmail: Map<string, NudgePlayer>;
}) {
  const table = findHistoryTable();
  if (!table) return;

  const rows = table.querySelectorAll<HTMLTableRowElement>("tbody tr");

  for (const row of rows) {
    if (row.getAttribute(DECORATED_ATTR) === "true") continue;

    const cell = row.querySelector<HTMLTableCellElement>("td:first-child");
    if (!cell) continue;

    const emailText = getEmailFromCell(cell);
    if (!emailText) continue;

    const player = input.playersByEmail.get(normaliseEmail(emailText));
    if (!player) continue;

    row.setAttribute(DECORATED_ATTR, "true");

    const ignoredCount = getIgnoredCount(row);
    if (ignoredCount <= 0) {
      if (player.lastNudgeAt) updateStatus(cell, player);
      continue;
    }

    const name = cell.querySelector<HTMLElement>("div.font-semibold.text-white");
    if (!name) continue;

    const nameRow = document.createElement("div");
    nameRow.className = "flex flex-wrap items-center gap-2";
    name.replaceWith(nameRow);
    nameRow.appendChild(name);
    nameRow.appendChild(
      createNudgeButton({
        teamId: input.teamId,
        player,
        cell,
      }),
    );

    updateStatus(cell, player);
  }
}

export default function CaptainAvailabilityHistoryNudgeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let frame: number | null = null;

    async function load() {
      try {
        const response = await fetch(
          `/api/captain/team/${encodeURIComponent(
            teamId,
          )}/availability-history-nudges`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => null)) as
          | NudgePayload
          | null;
        if (!response.ok || !payload?.players || cancelled) return;

        const playersByEmail = new Map<string, NudgePlayer>();
        for (const player of payload.players) {
          if (!player.email) continue;
          playersByEmail.set(normaliseEmail(player.email), player);
        }

        const decorate = () =>
          decorateHistoryRows({
            teamId,
            playersByEmail,
          });

        decorate();
        frame = window.requestAnimationFrame(decorate);
        observer = new MutationObserver(decorate);
        const main = document.querySelector(".captain-team-main");
        if (main) observer.observe(main, { childList: true, subtree: true });
      } catch (error) {
        console.error("Failed to load availability nudge history", error);
      }
    }

    void load();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
