// ========================================
// File: src/components/admin/payments/PendingPlayerFeesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type PendingPlayerFeeItem = {
  id: string;
  amount: string;
  paymentUrl: string | null;
  teamId: string;
  teamName: string;
  playerName: string;
  fixtureLabel: string;
  fixtureDate: string;
};

type PendingPlayerFeesResponse = {
  count: number;
  totalOutstanding: string;
  linksCreated: number;
  items: PendingPlayerFeeItem[];
};

function removeExistingPanel() {
  document.querySelector("[data-pending-player-fees-panel]")?.remove();
}

function createPanel(data: PendingPlayerFeesResponse) {
  const panel = document.createElement("section");
  panel.dataset.pendingPlayerFeesPanel = "true";
  panel.className =
    "rounded-3xl border border-amber-400/25 bg-amber-500/[0.08] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)]";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between";

  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/70";
  eyebrow.textContent = "Player match fees";

  const title = document.createElement("h2");
  title.className = "mt-2 text-2xl font-semibold tracking-tight text-white";
  title.textContent = `${data.totalOutstanding} pending from players`;

  const helper = document.createElement("p");
  helper.className = "mt-2 max-w-3xl text-sm leading-6 text-amber-50/75";
  helper.textContent = `${data.count} open player fee${data.count === 1 ? "" : "s"} are now included here alongside team charges. Payment links are generated automatically for open player fees.`;

  copy.append(eyebrow, title, helper);

  const badge = document.createElement("div");
  badge.className = "rounded-2xl border border-amber-400/20 bg-black/25 px-4 py-3 text-sm text-amber-100";
  badge.textContent = `${data.linksCreated} payment link${data.linksCreated === 1 ? "" : "s"} created/checked`;

  header.append(copy, badge);
  panel.appendChild(header);

  if (data.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55";
    empty.textContent = "No open player match fees right now.";
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "mt-5 grid gap-3";

  for (const item of data.items.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "rounded-2xl border border-white/10 bg-black/25 p-4";

    const rowInner = document.createElement("div");
    rowInner.className = "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between";

    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "text-base font-semibold text-white";
    name.textContent = `${item.playerName} · ${item.amount}`;

    const meta = document.createElement("div");
    meta.className = "mt-1 text-sm text-white/55";
    meta.textContent = `${item.teamName} · ${item.fixtureLabel} · ${item.fixtureDate}`;

    details.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-2 lg:justify-end";

    const teamLink = document.createElement("a");
    teamLink.href = `/admin/teams/${item.teamId}/match-fees`;
    teamLink.className = "inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]";
    teamLink.textContent = "Open team fees";
    actions.appendChild(teamLink);

    if (item.paymentUrl) {
      const payLink = document.createElement("a");
      payLink.href = item.paymentUrl;
      payLink.target = "_blank";
      payLink.rel = "noreferrer";
      payLink.className = "inline-flex items-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15";
      payLink.textContent = "Payment link";
      actions.appendChild(payLink);
    }

    rowInner.append(details, actions);
    row.appendChild(rowInner);
    list.appendChild(row);
  }

  panel.appendChild(list);
  return panel;
}

export default function PendingPlayerFeesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    removeExistingPanel();

    if (pathname !== "/admin/payments") return;

    let cancelled = false;

    async function loadPendingPlayerFees() {
      try {
        const response = await fetch("/api/admin/payments/pending-player-fees", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = (await response.json()) as PendingPlayerFeesResponse;
        if (cancelled) return;

        const main = document.querySelector("main");
        if (!main) return;

        const firstStatsGrid = main.querySelector(".grid");
        const panel = createPanel(data);

        if (firstStatsGrid?.parentElement) {
          firstStatsGrid.parentElement.insertBefore(panel, firstStatsGrid.nextSibling);
        } else {
          main.prepend(panel);
        }
      } catch {
        // Do not block the payments page if the supplemental panel cannot load.
      }
    }

    loadPendingPlayerFees();

    return () => {
      cancelled = true;
      removeExistingPanel();
    };
  }, [pathname]);

  return null;
}
