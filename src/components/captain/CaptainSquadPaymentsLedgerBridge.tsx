// ========================================
// File: src/components/captain/CaptainSquadPaymentsLedgerBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type LedgerEntry = {
  id: string;
  label: string;
  leagueSeason: string | null;
  fixtureDateLabel: string;
  venueName: string | null;
  amountLabel: string;
  paidLabel: string;
  outstandingPence: number;
  outstandingLabel: string;
  squadPaidLabel: string;
  squadOpenLabel: string;
};

type LedgerPayload = {
  selected: LedgerEntry | null;
  cards: {
    teamFeeLabel: string;
    ledgerChargeLabel: string;
    collectedLabel: string;
    playerOutstandingLabel: string;
    ledgerStillToCoverLabel: string;
    allocationText: string;
  };
  entries: LedgerEntry[];
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)\/player-payments/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function findCard(label: string) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("div.rounded-3xl"));
  return cards.find((card) => card.textContent?.toLowerCase().includes(label.toLowerCase())) ?? null;
}

function updateCard(label: string, value: string, helper: string) {
  const card = findCard(label);
  if (!card) return;
  const paragraphs = Array.from(card.querySelectorAll<HTMLParagraphElement>("p"));
  const valueParagraph = paragraphs.find((paragraph) => paragraph.className.includes("text-3xl"));
  const helperParagraph = paragraphs.at(-1) ?? null;
  if (valueParagraph) valueParagraph.textContent = value;
  if (helperParagraph) helperParagraph.textContent = helper;
}

function findPanel(headingText: string) {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2"));
  const heading = headings.find((item) => item.textContent?.trim().toLowerCase() === headingText.toLowerCase());
  return heading?.closest("div.rounded-3xl") ?? null;
}

function renderEntry(entry: LedgerEntry, index: number) {
  const isOutstanding = entry.outstandingPence > 0;
  const meta = [entry.fixtureDateLabel, entry.venueName, entry.leagueSeason].filter(Boolean).join(" · ");
  return `
    <div class="block rounded-2xl border p-4 ${index === 0 ? "border-emerald-400/30 bg-emerald-500/10 text-white" : "border-white/10 bg-black/20 text-white/70"}">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-sm font-semibold">${escapeHtml(entry.label)}</div>
        <span class="rounded-full border px-2 py-0.5 text-[10px] font-medium ${isOutstanding ? "border-amber-400/25 bg-amber-500/10 text-amber-100" : "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"}">${isOutstanding ? "Outstanding" : "Covered"}</span>
      </div>
      <div class="mt-1 text-xs text-white/50">${escapeHtml(meta)}</div>
      <div class="mt-3 grid gap-1 text-xs text-white/55">
        <div>Team ledger: ${escapeHtml(entry.paidLabel)} paid / ${escapeHtml(entry.amountLabel)} charge</div>
        <div>Player payments: ${escapeHtml(entry.squadPaidLabel)} collected · ${escapeHtml(entry.squadOpenLabel)} outstanding</div>
        <div>Ledger still to cover: ${escapeHtml(entry.outstandingLabel)}</div>
      </div>
    </div>
  `;
}

function updateFixtureList(payload: LedgerPayload) {
  const panel = findPanel("Choose fixture");
  const list = panel?.querySelector<HTMLElement>(".mt-5.space-y-2");
  if (!list) return;
  if (payload.entries.length === 0) return;
  list.innerHTML = payload.entries.map((entry, index) => renderEntry(entry, index)).join("");
}

function updateCreatePanel(payload: LedgerPayload) {
  const panel = findPanel("Create / update collection");
  const placeholder = Array.from(panel?.querySelectorAll<HTMLElement>("div.rounded-2xl") ?? [])
    .find((item) => item.textContent?.toLowerCase().includes("choose a published fixture"));
  if (!placeholder || !payload.selected) return;
  placeholder.textContent = `Existing ledger charge found: ${payload.selected.label}. ${payload.selected.outstandingLabel} still to cover. Use Team payments to record or chase the team charge.`;
}

async function refreshSquadPayments(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;
  if (document.documentElement.dataset.squadPaymentsLedgerLoaded === teamId) return;
  const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/squad-payment-ledger`, { cache: "no-store" });
  if (!response.ok) return;
  const payload = (await response.json()) as LedgerPayload;
  updateCard("Your team fee", payload.cards.teamFeeLabel, payload.selected ? "Open team charge in ledger." : "No open charge in ledger.");
  updateCard("Ledger charge", payload.cards.ledgerChargeLabel, payload.selected ? "From the team payment ledger." : "No ledger charge found.");
  updateCard("Collected", payload.cards.collectedLabel, payload.selected ? `Squad paid ${payload.selected.squadPaidLabel}` : "0 player payments");
  updateCard("Player payments outstanding", payload.cards.playerOutstandingLabel, payload.selected ? `Player links outstanding ${payload.selected.squadOpenLabel}` : "0 unpaid players");
  updateCard("Ledger still to cover", payload.cards.ledgerStillToCoverLabel, payload.selected ? "Team charge minus counted payments." : "No action needed.");
  const allocation = Array.from(document.querySelectorAll<HTMLElement>("section.rounded-3xl")).find((section) => section.textContent?.includes("Allocation and payment check"));
  const allocationParagraph = allocation?.querySelectorAll("p")[0] ?? null;
  if (allocationParagraph) allocationParagraph.textContent = payload.cards.allocationText;
  updateFixtureList(payload);
  updateCreatePanel(payload);
  document.documentElement.dataset.squadPaymentsLedgerLoaded = teamId;
}

export default function CaptainSquadPaymentsLedgerBridge() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname?.includes("/player-payments")) return;
    const frame = window.requestAnimationFrame(() => void refreshSquadPayments(pathname).catch(() => undefined));
    const timer = window.setTimeout(() => void refreshSquadPayments(pathname).catch(() => undefined), 700);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);
  return null;
}
