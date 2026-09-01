// ========================================
// File: src/components/captain/CaptainAdditionalCaptainBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CaptainRow = {
  membershipId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type CaptainPayload = {
  captains?: CaptainRow[];
  canManage?: boolean;
  error?: string;
};

function getCaptainSquadTeamId(pathname: string) {
  return /^\/captain\/team\/([^/]+)\/(?:captain-squad|squad)\/?$/.exec(pathname)?.[1] ?? null;
}

function findHeading(texts: string[]) {
  return Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find((heading) =>
    texts.includes(heading.textContent?.trim() ?? ""),
  );
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchCaptains(teamId: string): Promise<CaptainPayload> {
  const response = await fetch(
    `/api/captain/team/${encodeURIComponent(teamId)}/additional-captains`,
    { cache: "no-store" },
  );
  const payload = (await response.json().catch(() => null)) as CaptainPayload | null;
  if (!response.ok) throw new Error(payload?.error || "Could not load captains.");
  return payload ?? {};
}

function captainCard(captain: CaptainRow, canManage: boolean) {
  const name = escapeHtml(captain.name || captain.email || "Captain");
  const email = escapeHtml(captain.email || "");
  const phone = escapeHtml(captain.phone || "");

  return `
    <div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3" data-captain-row="${escapeHtml(captain.membershipId)}">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="text-sm font-semibold text-white">${name}</div>
          ${email ? `<div class="mt-1 text-xs text-white/50">${email}</div>` : ""}
          ${phone ? `<div class="mt-1 text-xs text-emerald-200/70">SMS ${phone}</div>` : `<div class="mt-1 text-xs text-white/35">No SMS number saved</div>`}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="inline-flex w-fit rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">Captain access</span>
          ${canManage ? `<button type="button" data-edit-captain class="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100">Edit</button><button type="button" data-remove-captain class="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100">Remove captain</button>` : ""}
        </div>
      </div>
      ${canManage ? `
        <form class="mt-4 hidden space-y-3 border-t border-white/10 pt-4" data-edit-captain-form>
          <input type="hidden" name="membershipId" value="${escapeHtml(captain.membershipId)}" />
          <div class="grid gap-3 sm:grid-cols-3">
            <input name="name" required value="${escapeHtml(captain.name || "")}" placeholder="Captain name" class="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none" />
            <input name="email" type="email" required value="${email}" placeholder="Email" class="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none" />
            <input name="phone" value="${phone}" placeholder="SMS number" class="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none" />
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="rounded-lg bg-sky-300 px-3 py-2 text-xs font-semibold text-black">Save captain</button>
            <button type="button" data-cancel-edit class="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70">Cancel</button>
          </div>
        </form>` : ""}
    </div>`;
}

async function renderCaptains(teamId: string, target: HTMLElement, status: HTMLElement) {
  try {
    const payload = await fetchCaptains(teamId);
    const captains = payload.captains ?? [];
    const canManage = Boolean(payload.canManage);
    target.innerHTML = captains.length
      ? captains.map((captain) => captainCard(captain, canManage)).join("")
      : '<div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">No captain memberships found.</div>';

    target.querySelectorAll<HTMLElement>("[data-captain-row]").forEach((row) => {
      const editButton = row.querySelector<HTMLButtonElement>("[data-edit-captain]");
      const removeButton = row.querySelector<HTMLButtonElement>("[data-remove-captain]");
      const editForm = row.querySelector<HTMLFormElement>("[data-edit-captain-form]");
      const cancelButton = row.querySelector<HTMLButtonElement>("[data-cancel-edit]");
      const membershipId = row.dataset.captainRow || "";

      editButton?.addEventListener("click", () => editForm?.classList.remove("hidden"));
      cancelButton?.addEventListener("click", () => editForm?.classList.add("hidden"));

      editForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(editForm);
        const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/additional-captains`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            membershipId,
            name: String(data.get("name") ?? ""),
            email: String(data.get("email") ?? ""),
            phone: String(data.get("phone") ?? ""),
          }),
        });
        const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (!response.ok) {
          status.className = "rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
          status.textContent = result?.error || "Captain could not be updated.";
          return;
        }
        status.className = "rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100";
        status.textContent = result?.message || "Captain updated.";
        await renderCaptains(teamId, target, status);
      });

      removeButton?.addEventListener("click", async () => {
        const label = row.querySelector(".text-sm.font-semibold")?.textContent?.trim() || "this captain";
        if (!window.confirm(`Remove captain access from ${label}? They will remain in the squad as a player.`)) return;
        const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/additional-captains`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipId }),
        });
        const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        status.className = response.ok
          ? "rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
          : "rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
        status.textContent = response.ok
          ? result?.message || "Captain access removed."
          : result?.error || "Captain could not be removed.";
        if (response.ok) await renderCaptains(teamId, target, status);
      });
    });
  } catch (error) {
    target.innerHTML = `<div class="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">${escapeHtml(error instanceof Error ? error.message : "Could not load captains.")}</div>`;
  }
}

function installAdditionalCaptainForm(teamId: string) {
  if (document.querySelector("[data-additional-captain-panel]")) return true;

  const addPlayerHeading = findHeading(["Add a player to your squad", "Attach an existing user"]);
  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");
  if (!addPlayerSection) return false;

  const panel = document.createElement("section");
  panel.dataset.additionalCaptainPanel = "true";
  panel.className = "rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)]";
  panel.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Team access</p>
    <h2 class="mt-2 text-xl font-semibold text-white">Captains</h2>
    <p class="mt-2 text-sm leading-6 text-amber-50/70">Every captain listed here can use the captain dashboard. Save an SMS number so important operational messages can reach them by text as well as email.</p>
    <div class="mt-4 space-y-2" data-current-captains><div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">Loading current captains…</div></div>
    <div class="mt-4 hidden rounded-xl border px-4 py-3 text-sm" data-captain-status></div>
    <div class="mt-6 border-t border-white/10 pt-5">
      <h3 class="text-base font-semibold text-white">Add another captain</h3>
      <form class="mt-4 space-y-4" data-additional-captain-form>
        <label class="block space-y-2 text-sm text-white/65"><span>Captain name</span><input name="name" required autocomplete="name" placeholder="e.g. Alex Smith" class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
        <label class="block space-y-2 text-sm text-white/65"><span>Email</span><input name="email" type="email" required autocomplete="email" placeholder="captain@example.com" class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
        <label class="block space-y-2 text-sm text-white/65"><span>SMS number</span><input name="phone" inputmode="tel" autocomplete="tel" placeholder="e.g. 07700 900123" class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none" /></label>
        <button type="submit" class="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-300 px-5 text-sm font-semibold text-black">Add captain and send login</button>
      </form>
    </div>`;

  addPlayerSection.insertAdjacentElement("beforebegin", panel);
  const currentCaptains = panel.querySelector<HTMLElement>("[data-current-captains]");
  const status = panel.querySelector<HTMLElement>("[data-captain-status]");
  const form = panel.querySelector<HTMLFormElement>("[data-additional-captain-form]");
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!currentCaptains || !status || !form || !button) return true;

  void renderCaptains(teamId, currentCaptains, status);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = "Adding captain…";
    const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/additional-captains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        phone: String(data.get("phone") ?? ""),
      }),
    });
    const result = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    status.className = response.ok
      ? "rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
      : "rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100";
    status.textContent = response.ok
      ? result?.message || "Captain added."
      : result?.error || "Captain could not be added.";
    if (response.ok) {
      form.reset();
      await renderCaptains(teamId, currentCaptains, status);
    }
    button.disabled = false;
    button.textContent = "Add captain and send login";
  });

  return true;
}

export default function CaptainAdditionalCaptainBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getCaptainSquadTeamId(pathname);
    if (!teamId) return;

    let frame = 0;
    let attempts = 0;
    let disposed = false;
    function install() {
      if (disposed) return;
      attempts += 1;
      const installed = installAdditionalCaptainForm(teamId);
      if (!installed && attempts < 60) frame = window.requestAnimationFrame(install);
    }
    frame = window.requestAnimationFrame(install);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>("[data-additional-captain-panel]").forEach((panel) => panel.remove());
    };
  }, [pathname]);

  return null;
}
