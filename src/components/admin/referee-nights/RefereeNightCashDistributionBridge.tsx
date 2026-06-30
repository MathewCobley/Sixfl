// ========================================
// File: src/components/admin/referee-nights/RefereeNightCashDistributionBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type CashDistributionPayload = {
  id: string;
  refereeName: string | null;
  refereeEmail: string | null;
  feePence: number;
  cashCollectedPence: number;
  dueToSixflPence: number;
  dueToRefereePence: number;
  cashPaidToRefereePence: number;
  cashReceivedFromRefereePence: number;
  remainingDueToRefereePence: number;
  remainingDueToSixflPence: number;
  cashDistributionNotes: string | null;
  cashDistributedAt: string | null;
};

function getRefereeNightIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/referee-nights\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

function formatMoney(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((pence ?? 0) / 100);
}

function formatInputPounds(pence: number) {
  return ((pence ?? 0) / 100).toFixed(2);
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function findSettlementColumn() {
  const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2")).find(
    (item) => item.textContent?.trim() === "Cashup summary",
  );

  return heading?.closest(".space-y-6") as HTMLElement | null;
}

function makeRow(label: string, value: string, tone = "text-white") {
  return `
    <div class="flex justify-between gap-4 text-sm">
      <span class="text-white/55">${label}</span>
      <span class="font-semibold ${tone}">${value}</span>
    </div>
  `;
}

function renderPanel(input: {
  refereeNightId: string;
  payload: CashDistributionPayload;
  onSaved: () => void;
}) {
  const existing = document.querySelector<HTMLElement>("[data-referee-cash-distribution='1']");
  if (existing) existing.remove();

  const column = findSettlementColumn();
  if (!column) return;

  const paidAtLabel = formatDate(input.payload.cashDistributedAt);
  const panel = document.createElement("section");
  panel.dataset.refereeCashDistribution = "1";
  panel.className = "overflow-hidden rounded-3xl border border-amber-400/20 bg-amber-500/[0.07]";

  panel.innerHTML = `
    <div class="border-b border-amber-400/15 px-6 py-5">
      <p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/70">Admin cash distribution</p>
      <h2 class="mt-2 text-2xl font-semibold text-white">Cash handed over</h2>
      <p class="mt-2 text-sm leading-6 text-amber-50/65">Use this when SIXFL/admin collected cash and then gave cash to the referee, or when the referee handed cash back to SIXFL.</p>
    </div>
    <div class="space-y-4 px-6 py-6">
      <div class="space-y-2 rounded-2xl border border-white/10 bg-black/20 p-4">
        ${makeRow("Night fee", formatMoney(input.payload.feePence))}
        ${makeRow("Cash recorded on this night", formatMoney(input.payload.cashCollectedPence))}
        ${makeRow("SIXFL originally owed ref", formatMoney(input.payload.dueToRefereePence), "text-amber-100")}
        ${makeRow("Ref originally owed SIXFL", formatMoney(input.payload.dueToSixflPence), "text-emerald-100")}
        ${makeRow("Admin paid/gave to ref", formatMoney(input.payload.cashPaidToRefereePence), "text-amber-100")}
        ${makeRow("Admin received from ref", formatMoney(input.payload.cashReceivedFromRefereePence), "text-emerald-100")}
        <div class="border-t border-white/10 pt-2">
          ${makeRow("Remaining due to ref", formatMoney(input.payload.remainingDueToRefereePence), input.payload.remainingDueToRefereePence > 0 ? "text-amber-100" : "text-emerald-100")}
          ${makeRow("Remaining due to SIXFL", formatMoney(input.payload.remainingDueToSixflPence), input.payload.remainingDueToSixflPence > 0 ? "text-emerald-100" : "text-white")}
        </div>
        ${paidAtLabel ? `<div class="pt-2 text-xs text-white/45">Last recorded ${paidAtLabel}</div>` : ""}
      </div>

      <form data-referee-cash-distribution-form="1" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Cash paid/given to referee (£)
            <input name="cashPaidToRefereePounds" type="number" min="0" step="0.01" value="${formatInputPounds(input.payload.cashPaidToRefereePence)}" class="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
          </label>
          <label class="block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
            Cash received from referee (£)
            <input name="cashReceivedFromRefereePounds" type="number" min="0" step="0.01" value="${formatInputPounds(input.payload.cashReceivedFromRefereePence)}" class="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none" />
          </label>
        </div>
        <label class="block text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
          Distribution notes
          <textarea name="cashDistributionNotes" rows="3" class="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none" placeholder="e.g. Mathew collected £40 from Roy's Boys and gave it to Oli after the night.">${input.payload.cashDistributionNotes ?? ""}</textarea>
        </label>
        <button type="submit" class="inline-flex h-11 items-center justify-center rounded-xl bg-amber-300 px-5 text-sm font-semibold text-black transition hover:bg-amber-200">Save cash distribution</button>
      </form>
    </div>
  `;

  const settlementPanel = Array.from(column.children).find((child) =>
    child.textContent?.includes("Cashup summary"),
  );

  if (settlementPanel?.nextSibling) {
    column.insertBefore(panel, settlementPanel.nextSibling);
  } else {
    column.appendChild(panel);
  }

  const form = panel.querySelector<HTMLFormElement>("[data-referee-cash-distribution-form='1']");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
    const originalText = submit?.textContent ?? "Save cash distribution";

    if (submit) {
      submit.disabled = true;
      submit.textContent = "Saving...";
    }

    try {
      const response = await fetch(`/api/admin/referee-nights/${encodeURIComponent(input.refereeNightId)}/cash-distribution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashPaidToRefereePounds: String(formData.get("cashPaidToRefereePounds") ?? ""),
          cashReceivedFromRefereePounds: String(formData.get("cashReceivedFromRefereePounds") ?? ""),
          cashDistributionNotes: String(formData.get("cashDistributionNotes") ?? ""),
        }),
      });

      const nextPayload = (await response.json().catch(() => null)) as CashDistributionPayload & { error?: string } | null;
      if (!response.ok || !nextPayload || nextPayload.error) {
        throw new Error(nextPayload?.error ?? "Could not save cash distribution.");
      }

      renderPanel({ refereeNightId: input.refereeNightId, payload: nextPayload, onSaved: input.onSaved });
      input.onSaved();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not save cash distribution.");
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalText;
      }
    }
  });
}

async function loadDistribution(refereeNightId: string) {
  const response = await fetch(`/api/admin/referee-nights/${encodeURIComponent(refereeNightId)}/cash-distribution`, {
    cache: "no-store",
  });

  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as CashDistributionPayload | null;
}

export default function RefereeNightCashDistributionBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const refereeNightIdFromPath = getRefereeNightIdFromPath(pathname);
    if (!refereeNightIdFromPath) return;

    const refereeNightId = refereeNightIdFromPath;
    let cancelled = false;

    async function load() {
      const payload = await loadDistribution(refereeNightId);
      if (cancelled || !payload) return;

      renderPanel({
        refereeNightId,
        payload,
        onSaved: () => router.refresh(),
      });
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
