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
    <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">
      Team access
    </p>
    <h2 class="mt-2 text-xl font-semibold text-white">Add another captain</h2>
    <p class="mt-2 text-sm leading-6 text-amber-50/70">
      Add someone you trust to share the captain dashboard. They will be able to manage fixtures, availability, squad information and team payments just like you.
    </p>
    <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-5 text-white/55">
      Captains cannot remove or demote other captains from this screen, so the team cannot accidentally be left without a captain.
    </div>
    <form class="mt-5 space-y-4" data-additional-captain-form>
      <label class="block space-y-2 text-sm text-white/65">
        <span>Captain name</span>
        <input
          name="name"
          required
          autocomplete="name"
          placeholder="e.g. Alex Smith"
          class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/50"
        />
      </label>
      <label class="block space-y-2 text-sm text-white/65">
        <span>Email</span>
        <input
          name="email"
          type="email"
          required
          autocomplete="email"
          placeholder="captain@example.com"
          class="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/50"
        />
      </label>
      <div class="hidden rounded-xl border px-4 py-3 text-sm" data-additional-captain-status></div>
      <button
        type="submit"
        class="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"
      >
        Add captain and send login
      </button>
    </form>
  `;

  addPlayerSection.insertAdjacentElement("beforebegin", panel);

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
    status.className =
      "rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/65";
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

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The captain could not be added.");
      }

      status.className =
        "rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100";
      status.textContent = payload?.message || "Captain access has been added.";
      button.textContent = "Captain added";

      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      status.className =
        "rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100";
      status.textContent =
        error instanceof Error ? error.message : "The captain could not be added.";
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

      const installed = installAdditionalCaptainForm(teamId);
      if (!installed && attempts < 30) {
        frame = window.requestAnimationFrame(install);
      }
    }

    frame = window.requestAnimationFrame(install);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      document
        .querySelectorAll<HTMLElement>("[data-additional-captain-panel]")
        .forEach((panel) => panel.remove());
    };
  }, [pathname]);

  return null;
}
