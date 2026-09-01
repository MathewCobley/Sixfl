// ========================================
// File: src/components/captain/CaptainAdditionalCaptainBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getCaptainSquadTeamId(pathname: string) {
  return /^\/captain\/team\/([^/]+)\/captain-squad\/?$/.exec(pathname)?.[1] ?? null;
}

function findHeading(text: string) {
  return Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find(
    (heading) => heading.textContent?.trim() === text,
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

async function loadCaptains(teamId: string, target: HTMLElement) {
  try {
    const response = await fetch(
      `/api/captain/team/${encodeURIComponent(teamId)}/additional-captains`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as {
      captains?: Array<{ membershipId: string; name: string | null; email: string | null }>;
      error?: string;
    } | null;

    if (!response.ok) throw new Error(payload?.error || "Could not load captains.");

    const captains = payload?.captains ?? [];
    target.innerHTML = captains.length
      ? captains
          .map(
            (captain) => `
              <div class="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div class="text-sm font-semibold text-white">${escapeHtml(captain.name || captain.email || "Captain")}</div>
                  ${captain.email ? `<div class="mt-1 text-xs text-white/50">${escapeHtml(captain.email)}</div>` : ""}
                </div>
                <span class="mt-2 inline-flex w-fit rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 sm:mt-0">Captain access</span>
              </div>`,
          )
          .join("")
      : '<div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">No captain memberships found.</div>';
  } catch (error) {
    target.innerHTML = `<div class="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">${escapeHtml(error instanceof Error ? error.message : "Could not load captains.")}</div>`;
  }
}

function installAdditionalCaptainForm(teamId: string) {
  if (document.querySelector("[data-additional-captain-panel]")) return true;

  const addPlayerHeading = findHeading("Add a player to your squad");
  const addPlayerSection = addPlayerHeading?.closest<HTMLElement>("section");

  if (!addPlayerSection) {
    const managedHeading = findHeading("Player additions are managed by SIXFL");
    return Boolean(managedHeading);
  }

  const panel = document.createElement("section");
  panel.dataset.additionalCaptainPanel = "true";
  panel.className =
    "rounded-3xl border border-amber-400/20 bg-amber-500/[0.07] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.2)]";

  panel.innerHTML = `
    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Team access</p>
    <h2 class="mt-2 text-xl font-semibold text-white">Captains</h2>
    <p class="mt-2 text-sm leading-6 text-amber-50/70">
      Every captain listed here can use the same captain dashboard. Important operational fixture messages are also sent to all captains who have contact details saved.
    </p>

    <div class="mt-4 space-y-2" data-current-captains>
      <div class="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55">Loading current captains…</div>
    </div>

    <div class="mt-6 border-t border-white/10 pt-5">
      <h3 class="text-base font-semibold text-white">Add another captain</h3>
      <p class="mt-2 text-sm leading-6 text-white/60">
        Add someone you trust to share fixtures, availability, squad information and team payments.
      </p>
      <div class="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/55">
        Captains cannot remove or demote another captain from this screen. SIXFL admin can correct captain access if needed.
      </div>
      <form class="mt-5 space-y-4" data-additional-captain-form>
        <label class="block space-y-2 text-sm text-white/65">
          <span>Captain name</span>
          <input name="name" required autocomplete="name" placeholder="e.g. Alex Smith" class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/50" />
        </label>
        <label class="block space-y-2 text-sm text-white/65">
          <span>Email</span>
          <input name="email" type="email" required autocomplete="email" placeholder="captain@example.com" class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/50" />
        </label>
        <div class="hidden rounded-xl border px-4 py-3 text-sm" data-additional-captain-status></div>
        <button type="submit" class="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60">
          Add captain and send login
        </button>
      </form>
    </div>
  `;

  addPlayerSection.insertAdjacentElement("beforebegin", panel);

  const currentCaptains = panel.querySelector<HTMLElement>("[data-current-captains]");
  if (currentCaptains) void loadCaptains(teamId, currentCaptains);

  const form = panel.querySelector<HTMLFormElement>("[data-additional-captain-form]");
  const status = panel.querySelector<HTMLElement>("[data-additional-captain-status]");
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (!form || !status || !button) return true;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();

    button.disabled = true;
    button.textContent = "Adding captain…";
    status.className = "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65";
    status.textContent = "Creating captain access and sending the login email…";

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/additional-captains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email }),
        },
      );

      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The captain could not be added.");

      status.className = "rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100";
      status.textContent = payload?.message || "Captain access has been added.";
      button.textContent = "Captain added";
      form.reset();
      if (currentCaptains) await loadCaptains(teamId, currentCaptains);
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "Add captain and send login";
      }, 800);
    } catch (error) {
      status.className = "rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100";
      status.textContent = error instanceof Error ? error.message : "The captain could not be added.";
      button.disabled = false;
      button.textContent = "Add captain and send login";
    }
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
      const installed = installAdditionalCaptainForm(teamId!);
      if (!installed && attempts < 30) frame = window.requestAnimationFrame(install);
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
