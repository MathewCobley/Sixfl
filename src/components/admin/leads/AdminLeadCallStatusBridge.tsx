"use client";

import { useEffect } from "react";

type CallStatus = { id: string; calledAt: string | null };
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

function buildNoteControl(leadId: string) {
  const wrapper = document.createElement("div");
  wrapper.className = "mt-2";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "text-xs font-semibold text-emerald-200 hover:text-emerald-100";
  toggle.textContent = "+ Add note";

  const form = document.createElement("div");
  form.className = "mt-2 hidden w-[220px] space-y-2";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "What did they say?";
  textarea.className = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/30 focus:border-emerald-500/50";

  const actions = document.createElement("div");
  actions.className = "flex gap-2";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-100 disabled:opacity-60";
  save.textContent = "Save note";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "px-2 py-1.5 text-xs text-white/50 hover:text-white";
  cancel.textContent = "Cancel";

  toggle.addEventListener("click", () => {
    form.classList.remove("hidden");
    toggle.classList.add("hidden");
    textarea.focus();
  });

  cancel.addEventListener("click", () => {
    textarea.value = "";
    form.classList.add("hidden");
    toggle.classList.remove("hidden");
  });

  save.addEventListener("click", async () => {
    const note = textarea.value.trim();
    if (!note) {
      textarea.focus();
      return;
    }

    save.disabled = true;
    save.textContent = "Saving…";
    try {
      const response = await fetch("/api/admin/leads/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, note }),
      });
      if (!response.ok) throw new Error("Could not save lead note.");
      textarea.value = "";
      form.classList.add("hidden");
      toggle.classList.remove("hidden");
      toggle.textContent = "✓ Note saved · add another";
      window.setTimeout(() => { toggle.textContent = "+ Add note"; }, 2500);
    } catch (error) {
      console.error(error);
      save.textContent = "Try again";
    } finally {
      save.disabled = false;
      if (save.textContent !== "Try again") save.textContent = "Save note";
    }
  });

  actions.append(save, cancel);
  form.append(textarea, actions);
  wrapper.append(toggle, form);
  return wrapper;
}

function buildCell(leadId: string, calledAt: string | null) {
  const cell = document.createElement("td");
  cell.dataset.leadCalledCell = leadId;
  cell.className = "px-4 py-3";

  const callWrapper = document.createElement("div");

  if (calledAt) {
    callWrapper.innerHTML = `<div class="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">✓ Called</div><div class="mt-1 whitespace-nowrap text-[11px] text-white/40">${formatCalledAt(calledAt)}</div>`;
  } else {
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
    callWrapper.appendChild(button);
  }

  cell.append(callWrapper, buildNoteControl(leadId));
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
      const statuses = new Map((payload.leads ?? []).map((lead) => [lead.id, lead.calledAt]));

      const headerRow = table.querySelector<HTMLTableRowElement>("thead tr");
      const actionHeader = headerRow?.lastElementChild;
      if (headerRow && actionHeader) {
        const th = document.createElement("th");
        th.className = "px-4 py-3 font-semibold";
        th.textContent = "Call / notes";
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
    return () => { disposed = true; };
  }, []);

  return null;
}
