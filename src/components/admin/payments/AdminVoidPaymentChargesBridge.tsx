// ========================================
// File: src/components/admin/payments/AdminVoidPaymentChargesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type VoidableCharge = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string | null;
  status: string;
  amount: string;
  outstanding: string;
  outstandingPence: number;
  paidTotalPence: number;
  fixtureLabel: string | null;
};

type VoidableChargesResponse = {
  items: VoidableCharge[];
};

function removeExistingPanel() {
  document.querySelector("[data-admin-void-payment-charges-panel]")?.remove();
}

function createPanel(input: {
  items: VoidableCharge[];
  onVoided: () => void;
}) {
  const panel = document.createElement("section");
  panel.dataset.adminVoidPaymentChargesPanel = "true";
  panel.className =
    "rounded-3xl border border-red-400/20 bg-red-500/[0.06] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]";

  const header = document.createElement("div");
  header.className = "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between";

  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "text-[11px] font-semibold uppercase tracking-[0.22em] text-red-200/75";
  eyebrow.textContent = "Admin only";

  const title = document.createElement("h2");
  title.className = "mt-2 text-2xl font-semibold tracking-tight text-white";
  title.textContent = "Void unpaid team charges";

  const helper = document.createElement("p");
  helper.className = "mt-2 max-w-3xl text-sm leading-6 text-red-50/75";
  helper.textContent =
    "Use this when a game is conceded or cancelled and the team charge should no longer be collected. Charges with recorded payments cannot be voided here.";

  copy.append(eyebrow, title, helper);

  const count = document.createElement("div");
  count.className = "rounded-2xl border border-red-400/20 bg-black/25 px-4 py-3 text-sm text-red-100";
  count.textContent = `${input.items.length} open charge${input.items.length === 1 ? "" : "s"}`;

  header.append(copy, count);
  panel.appendChild(header);

  if (input.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/55";
    empty.textContent = "No open team charges to void.";
    panel.appendChild(empty);
    return panel;
  }

  const list = document.createElement("div");
  list.className = "mt-5 grid gap-3";

  for (const item of input.items) {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-white/10 bg-black/25 p-4";

    const row = document.createElement("div");
    row.className = "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between";

    const details = document.createElement("div");

    const name = document.createElement("div");
    name.className = "text-base font-semibold text-white";
    name.textContent = `${item.teamName} · ${item.title}`;

    const meta = document.createElement("div");
    meta.className = "mt-1 text-sm text-white/55";
    meta.textContent = [
      item.fixtureLabel,
      `Amount ${item.amount}`,
      `Outstanding ${item.outstanding}`,
      item.status,
    ]
      .filter(Boolean)
      .join(" · ");

    const warning = document.createElement("div");
    warning.className = item.paidTotalPence > 0 ? "mt-2 text-xs text-amber-200" : "hidden";
    warning.textContent = "Payment already recorded — review/refund manually before voiding.";

    details.append(name, meta, warning);

    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-2 lg:justify-end";

    const openTeam = document.createElement("a");
    openTeam.href = `/admin/teams/${item.teamId}`;
    openTeam.className = "inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]";
    openTeam.textContent = "Open team";
    actions.appendChild(openTeam);

    const button = document.createElement("button");
    button.type = "button";
    button.disabled = item.paidTotalPence > 0 || item.outstandingPence <= 0;
    button.className =
      "inline-flex items-center rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-50 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40";
    button.textContent = "Void charge";

    button.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Void this unpaid team charge?\n\n${item.teamName}\n${item.title}\n${item.outstanding} outstanding\n\nThis will cancel queued payment reminders.`,
      );

      if (!confirmed) return;

      button.disabled = true;
      button.textContent = "Voiding...";

      try {
        const response = await fetch("/api/admin/payments/void-charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chargeId: item.id,
            reason: "Game conceded / fixture not played",
          }),
        });

        const data = (await response.json().catch(() => null)) as { error?: string } | null;

        if (!response.ok) {
          throw new Error(data?.error ?? "Could not void charge.");
        }

        window.alert("Team charge voided and queued payment reminders cancelled.");
        input.onVoided();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Could not void charge.");
        button.disabled = item.paidTotalPence > 0 || item.outstandingPence <= 0;
        button.textContent = "Void charge";
      }
    });

    actions.appendChild(button);
    row.append(details, actions);
    card.appendChild(row);
    list.appendChild(card);
  }

  panel.appendChild(list);
  return panel;
}

export default function AdminVoidPaymentChargesBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    removeExistingPanel();

    if (pathname !== "/admin/payments") return;

    let cancelled = false;

    async function loadCharges() {
      try {
        const response = await fetch("/api/admin/payments/voidable-charges", {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = (await response.json()) as VoidableChargesResponse;
        if (cancelled) return;

        const main = document.querySelector("main");
        if (!main) return;

        const firstGrid = main.querySelector(".grid");
        const panel = createPanel({
          items: data.items,
          onVoided: () => router.refresh(),
        });

        if (firstGrid?.parentElement) {
          firstGrid.parentElement.insertBefore(panel, firstGrid.nextSibling);
        } else {
          main.prepend(panel);
        }
      } catch {
        // Do not block the payments page if this admin-only helper cannot load.
      }
    }

    loadCharges();

    return () => {
      cancelled = true;
      removeExistingPanel();
    };
  }, [pathname, router]);

  return null;
}
