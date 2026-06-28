// ========================================
// File: src/components/admin/referees/AdminRefereeCommsHistoryBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type RefereeCommsItem = {
  id: string;
  type: string;
  channel: string;
  direction: string;
  status: string;
  subject: string | null;
  body: string;
  detail: string;
  contact: string | null;
  failureReason: string | null;
  when: string;
};

type RefereeCommsPayload = {
  items?: RefereeCommsItem[];
};

function getRefereeIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/referees\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function badgeClasses(channel: string) {
  return channel === "SMS"
    ? "border-sky-400/25 bg-sky-500/10 text-sky-100"
    : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
}

function findRightColumn() {
  const profileLabel = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
    (item) => item.textContent?.trim() === "Referee profile",
  );

  return profileLabel?.closest(".space-y-6") as HTMLElement | null;
}

function renderCommsPanel(items: RefereeCommsItem[]) {
  if (document.querySelector("[data-referee-comms-history='1']")) return;

  const column = findRightColumn();
  if (!column) return;

  const panel = document.createElement("section");
  panel.dataset.refereeCommsHistory = "1";
  panel.className = "rounded-3xl border border-white/10 bg-black/25 p-5 sm:p-6";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between";
  header.innerHTML = `
    <div>
      <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Communication history</div>
      <h2 class="mt-2 text-xl font-bold text-white">Referee comms</h2>
      <p class="mt-2 text-sm leading-6 text-white/60">Email and SMS activity recorded through the SIXFL notification and messaging system.</p>
    </div>
    <div class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-white/55">${items.length} item${items.length === 1 ? "" : "s"}</div>
  `;

  const body = document.createElement("div");
  body.className = "mt-4 space-y-3";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm leading-6 text-white/55";
    empty.textContent = "No email or SMS communication has been recorded for this referee yet.";
    body.appendChild(empty);
  } else {
    for (const item of items) {
      const card = document.createElement("article");
      card.className = "rounded-2xl border border-white/10 bg-white/[0.03] p-4";

      const title = item.subject?.trim() || `${item.channel} ${item.direction.toLowerCase()}`;
      const channelClass = badgeClasses(item.channel);

      card.innerHTML = `
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${channelClass}">${item.channel}</span>
          <span class="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">${item.direction}</span>
          <span class="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">${item.status}</span>
        </div>
        <div class="mt-3 text-sm font-semibold text-white">${title}</div>
        <div class="mt-1 text-xs leading-5 text-white/45">${formatWhen(item.when)}${item.contact ? ` · ${item.contact}` : ""}</div>
        <p class="mt-3 text-sm leading-6 text-white/68">${item.body}</p>
        <div class="mt-2 text-xs leading-5 text-white/40">${item.detail}</div>
        ${item.failureReason ? `<div class="mt-2 text-xs leading-5 text-red-200">${item.failureReason}</div>` : ""}
      `;

      body.appendChild(card);
    }
  }

  panel.appendChild(header);
  panel.appendChild(body);

  const sourceLead = Array.from(column.children).find((child) =>
    child.textContent?.includes("Source lead"),
  );

  if (sourceLead) {
    column.insertBefore(panel, sourceLead);
  } else {
    column.appendChild(panel);
  }
}

export default function AdminRefereeCommsHistoryBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const refereeId = getRefereeIdFromPath(pathname);
    if (!refereeId) return;

    let cancelled = false;

    async function load() {
      const response = await fetch(`/api/admin/referees/${encodeURIComponent(refereeId)}/communications`, {
        cache: "no-store",
      });
      if (!response.ok) return;

      const payload = (await response.json().catch(() => null)) as RefereeCommsPayload | null;
      if (cancelled) return;

      renderCommsPanel(payload?.items ?? []);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
