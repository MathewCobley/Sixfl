"use client";

import { useEffect } from "react";

type CallStatus = { id: string; contactedAt: string | null };

type StatusResponse = { leads?: CallStatus[] };

function formatCalledAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function getLeadId(row: HTMLTableRowElement) {
  const href = Array.from(row.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/leads/"]'))
    .map((link) => link.getAttribute("href") ?? "")
    .find((value) => /^\/admin\/leads\/[^/]+(?:$|\?)/.test(value));
  if (!href) return null;
  return /^\/admin\/leads\/([^/?#]+)/.exec(href)?.[1] ?? null;
}

function buildCell(leadId: string, contactedAt: string | null) {
  const cell = document.createElement("td");
  cell.dataset.leadCalledCell = leadId;
  cell.className = "px-4 py-3";

  if (contactedAt) {
    cell.innerHTML = `<div class="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">✓ Called</div><div class="mt-1 whitespace-nowrap text-[11px] text-white/40">${formatCalledAt(contactedAt)}</div>`;
    return cell;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "inline-flex min-h-9 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60";
  button.textContent = "Mark called";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const response = await fetch("/api/admin/leads/call-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (!response.ok) throw new Error("Could not mark lead as called.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "Try again";
    }
  });
  cell.appendChild(button);
  return cell;
}

export default function AdminLeadCallStatusBridge() {
  useEffect(() => {
    let disposed = false;

    async function install() {
      const table = document.querySelector<HTMLTableElement>("table");
      if (!table || table.dataset.leadCalledInstalled === "true") return;

      const response = await fetch("/api/admin/leads/call-status", { cache: "no-store" });
      if (!response.ok || disposed) return;
      const payload = (await response.json()) as StatusResponse;
      const statuses = new Map((payload.leads ?? []).map((lead) => [lead.id, lead.contactedAt]));

      const headerRow = table.querySelector<HTMLTableRowElement>("thead tr");
      const actionHeader = headerRow?.lastElementChild;
      if (headerRow && actionHeader) {
        const th = document.createElement("th");
        th.className = "px-4 py-3 font-semibold";
        th.textContent = "Called";
        headerRow.insertBefore(th, actionHeader);
      }

      table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
        const leadId = getLeadId(row);
        const actionCell = row.lastElementChild;
        if (!leadId || !actionCell) return;
        row.insertBefore(buildCell(leadId, statuses.get(leadId) ?? null), actionCell);
      });

      table.dataset.leadCalledInstalled = "true";
    }

    void install().catch((error) => console.error("Lead call status could not be loaded", error));
    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
