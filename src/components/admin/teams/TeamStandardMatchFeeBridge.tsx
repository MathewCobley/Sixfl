// ========================================
// File: src/components/admin/teams/TeamStandardMatchFeeBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type StandardFeePayload = {
  teamId: string;
  teamName: string;
  standardMatchFeePence: number;
  standardMatchFeePounds: string;
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/admin\/teams\/([^/]+)(?:\/)?$/);
  const value = match?.[1] ?? null;
  return value && value !== "new" ? value : null;
}

function removeExisting() {
  document.querySelector("[data-team-standard-match-fee]")?.remove();
}

function findTeamSettingsForm() {
  return document.querySelector<HTMLFormElement>('form input[name="id"]')?.closest("form") ?? null;
}

function renderCard(teamId: string, payload: StandardFeePayload) {
  const card = document.createElement("div");
  card.dataset.teamStandardMatchFee = "true";
  card.className = "rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 md:p-8";

  card.innerHTML = `
    <div>
      <h2 class="text-lg font-semibold text-white">Standard match fee</h2>
      <p class="mt-1 text-sm leading-6 text-white/60">
        This is the normal team fee used by the bulk fixture generator and the backfill fees tool.
      </p>
    </div>
    <div class="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label class="space-y-2">
        <span class="block text-sm text-white/60">Team match fee</span>
        <span class="relative block">
          <span class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-white/45">£</span>
          <input
            data-standard-match-fee-input="true"
            type="number"
            min="0"
            step="0.01"
            value="${payload.standardMatchFeePounds}"
            class="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 pl-8 text-white placeholder:text-white/35 outline-none transition focus:border-emerald-500/60"
          />
        </span>
      </label>
      <button
        type="button"
        data-standard-match-fee-save="true"
        class="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        Save fee
      </button>
    </div>
    <p data-standard-match-fee-status="true" class="mt-3 text-xs text-white/50">
      Current standard fee: £${payload.standardMatchFeePounds}
    </p>
  `;

  const input = card.querySelector<HTMLInputElement>('[data-standard-match-fee-input="true"]');
  const button = card.querySelector<HTMLButtonElement>('[data-standard-match-fee-save="true"]');
  const status = card.querySelector<HTMLElement>('[data-standard-match-fee-status="true"]');

  button?.addEventListener("click", async () => {
    if (!input || !button || !status) return;

    button.disabled = true;
    button.textContent = "Saving…";
    status.className = "mt-3 text-xs text-emerald-200";
    status.textContent = "Saving standard match fee…";

    const response = await fetch(`/api/admin/teams/${teamId}/standard-match-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ standardMatchFeePounds: input.value }),
    });

    const result = (await response.json().catch(() => null)) as Partial<StandardFeePayload> & {
      error?: string;
    } | null;

    button.disabled = false;
    button.textContent = "Save fee";

    if (!response.ok) {
      status.className = "mt-3 text-xs text-red-300";
      status.textContent = result?.error ?? "The standard match fee could not be saved.";
      return;
    }

    input.value = result?.standardMatchFeePounds ?? input.value;
    status.className = "mt-3 text-xs text-emerald-200";
    status.textContent = `Saved. Current standard fee: £${result?.standardMatchFeePounds ?? input.value}`;
  });

  return card;
}

async function injectStandardFeeCard(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) {
    removeExisting();
    return;
  }

  const existing = document.querySelector("[data-team-standard-match-fee]");
  if (existing?.getAttribute("data-team-id") === teamId) return;

  const form = findTeamSettingsForm();
  if (!form) return;

  try {
    const response = await fetch(`/api/admin/teams/${teamId}/standard-match-fee`, {
      cache: "no-store",
    });
    if (!response.ok) return;

    const payload = (await response.json()) as StandardFeePayload;
    const card = renderCard(teamId, payload);
    card.setAttribute("data-team-id", teamId);

    removeExisting();
    form.closest("div.rounded-3xl")?.insertAdjacentElement("afterend", card);
  } catch {
    // Leave the normal page alone if the enhancement fails.
  }
}

export default function TeamStandardMatchFeeBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/teams/")) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) void injectStandardFeeCard(pathname);
    };

    const frame = window.requestAnimationFrame(run);
    const timer = window.setTimeout(run, 500);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      removeExisting();
    };
  }, [pathname]);

  return null;
}
