// ========================================
// File: src/components/captain/SquadPaymentAmountSync.tsx
// ========================================

"use client";

import { useEffect } from "react";

function normaliseAmount(value: string) {
  const numeric = Number(String(value).replace(/[£,\s]/g, ""));

  if (!Number.isFinite(numeric) || numeric < 0) return null;

  return numeric.toFixed(2);
}

function getDefaultInput() {
  return document.querySelector<HTMLInputElement>(
    'form[action] input[name="amount"], input#amount[name="amount"]',
  );
}

function getAmountInputs() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input[name^="amount_member_"], input[name^="amount_prospect_"]',
    ),
  );
}

function getPaymentIdentity(input: HTMLInputElement) {
  const match = input.name.match(/^amount_(member|prospect)_(.+)$/);
  if (!match) return null;
  return { type: match[1] as "member" | "prospect", id: match[2] };
}

function getPlayerCheckbox(input: HTMLInputElement) {
  const identity = getPaymentIdentity(input);
  if (!identity) return null;

  return document.querySelector<HTMLInputElement>(
    `input[type="checkbox"][name="player"][value="${identity.type}:${identity.id}"]`,
  );
}

function getPaymentCard(input: HTMLInputElement) {
  return input.closest("div.rounded-xl") as HTMLElement | null;
}

function getExistingStatusText(card: HTMLElement | null) {
  if (!card) return "";

  return Array.from(card.querySelectorAll("span"))
    .map((span) => span.textContent?.trim() ?? "")
    .find((text) => ["Paid", "Waived", "Unpaid", "Cancelled"].includes(text)) ?? "";
}

function getCollectionControlName(input: HTMLInputElement) {
  const identity = getPaymentIdentity(input);
  return identity ? `collection_${identity.type}_${identity.id}` : null;
}

function isNoLinkPaidBySixfl(input: HTMLInputElement) {
  const amount = Number(normaliseAmount(input.value) ?? "0");
  const card = getPaymentCard(input);
  return getExistingStatusText(card) === "Waived" && amount > 0;
}

function updateStatusBadgeText(input: HTMLInputElement) {
  const card = getPaymentCard(input);
  if (!card) return;

  const amount = Number(normaliseAmount(input.value) ?? "0");
  for (const span of Array.from(card.querySelectorAll("span"))) {
    const text = span.textContent?.trim();
    if (text === "Waived" && amount > 0) {
      span.textContent = "Paid SIXFL via DD";
    }
  }
}

function getSelectedCollectionMethod(input: HTMLInputElement) {
  const controlName = getCollectionControlName(input);
  if (!controlName) return "link";

  const checked = document.querySelector<HTMLInputElement>(
    `input[type="radio"][name="${controlName}"]:checked`,
  );

  return checked?.value ?? "link";
}

function ensureCollectionMethodControls(input: HTMLInputElement, defaultInput: HTMLInputElement) {
  if (input.disabled) return;

  const identity = getPaymentIdentity(input);
  const controlName = getCollectionControlName(input);
  const card = getPaymentCard(input);

  if (!identity || !controlName || !card) return;
  if (card.querySelector(`[data-collection-method-for="${controlName}"]`)) return;

  const checkbox = getPlayerCheckbox(input);
  const existingStatus = getExistingStatusText(card);
  const amount = Number(normaliseAmount(input.value) ?? "0");
  const currentMethod = isNoLinkPaidBySixfl(input)
    ? "captain_paid"
    : existingStatus === "Waived" || amount === 0
      ? "waived"
      : "link";

  const wrapper = document.createElement("div");
  wrapper.dataset.collectionMethodFor = controlName;
  wrapper.className = "mt-3 rounded-xl border border-white/10 bg-black/20 p-3";

  const title = document.createElement("div");
  title.className = "text-xs font-semibold uppercase tracking-[0.14em] text-white/45";
  title.textContent = "Collection method";
  wrapper.appendChild(title);

  const options = [
    {
      value: "link",
      label: "Send SIXFL payment link/email",
      help: "Use this when the player still needs to pay online.",
    },
    {
      value: "captain_paid",
      label: "Paid SIXFL via DD",
      help: "No player link or email. This share is treated as already covered with SIXFL.",
    },
    {
      value: "waived",
      label: "Waived / no charge",
      help: "No payment expected from this player.",
    },
  ];

  for (const option of options) {
    const label = document.createElement("label");
    label.className = "mt-2 flex cursor-pointer items-start gap-2 text-xs text-white/70";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = controlName;
    radio.value = option.value;
    radio.defaultChecked = option.value === currentMethod;
    radio.className = "mt-0.5";

    const copy = document.createElement("span");
    copy.innerHTML = `<span class="font-medium text-white/85">${option.label}</span><span class="mt-0.5 block text-white/45">${option.help}</span>`;

    label.appendChild(radio);
    label.appendChild(copy);
    wrapper.appendChild(label);

    radio.addEventListener("change", () => {
      if (!radio.checked) return;

      if (checkbox) checkbox.checked = true;

      if (radio.value === "waived") {
        input.value = "0.00";
        input.dataset.customAmount = "true";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      if (radio.value === "link" && Number(normaliseAmount(input.value) ?? "0") === 0) {
        input.value = normaliseAmount(defaultInput.value) ?? "0.00";
        input.dataset.customAmount = "false";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  const amountRow = input.closest("div.mt-3") ?? input.parentElement;
  amountRow?.insertAdjacentElement("afterend", wrapper);
  updateStatusBadgeText(input);
}

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

function getCaptainTeamIdFromPathname() {
  const match = window.location.pathname.match(/^\/captain\/team\/([^/]+)\/player-payments/);
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

function findDashboardCard(label: string) {
  const cards = Array.from(document.querySelectorAll<HTMLElement>("div.rounded-3xl"));
  return cards.find((card) => card.textContent?.toLowerCase().includes(label.toLowerCase())) ?? null;
}

function setDashboardCard(label: string, value: string, helper: string) {
  const card = findDashboardCard(label);
  if (!card) return;

  const paragraphs = Array.from(card.querySelectorAll<HTMLParagraphElement>("p"));
  const valueParagraph = paragraphs.find((paragraph) => paragraph.className.includes("text-3xl"));
  const helperParagraph = paragraphs.at(-1) ?? null;

  if (valueParagraph) valueParagraph.textContent = value;
  if (helperParagraph) helperParagraph.textContent = helper;
}

function findPanelByHeading(headingText: string) {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>("h2"));
  const heading = headings.find((item) => item.textContent?.trim().toLowerCase() === headingText.toLowerCase());
  return heading?.closest("div.rounded-3xl") ?? null;
}

function renderLedgerEntry(entry: LedgerEntry, index: number) {
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

function updateLedgerFixtureList(payload: LedgerPayload) {
  const panel = findPanelByHeading("Choose fixture");
  const list = panel?.querySelector<HTMLElement>(".mt-5.space-y-2");
  if (!list || payload.entries.length === 0) return;

  list.innerHTML = payload.entries.map((entry, index) => renderLedgerEntry(entry, index)).join("");
}

function updateLedgerCreatePanel(payload: LedgerPayload) {
  const panel = findPanelByHeading("Create / update collection");
  const placeholder = Array.from(panel?.querySelectorAll<HTMLElement>("div.rounded-2xl") ?? [])
    .find((item) => item.textContent?.toLowerCase().includes("choose a published fixture"));
  if (!placeholder || !payload.selected) return;

  placeholder.textContent = `Existing ledger charge found: ${payload.selected.label}. ${payload.selected.outstandingLabel} still to cover. Use Team payments to record or chase the team charge.`;
}

async function refreshLedgerFromServer() {
  const teamId = getCaptainTeamIdFromPathname();
  if (!teamId) return;
  if (document.documentElement.dataset.squadPaymentsLedgerLoaded === teamId) return;

  const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/squad-payment-ledger`, { cache: "no-store" });
  if (!response.ok) return;

  const payload = (await response.json()) as LedgerPayload;
  setDashboardCard("Your team fee", payload.cards.teamFeeLabel, payload.selected ? "Open team charge in ledger." : "No open charge in ledger.");
  setDashboardCard("Ledger charge", payload.cards.ledgerChargeLabel, payload.selected ? "From the team payment ledger." : "No ledger charge found.");
  setDashboardCard("Collected", payload.cards.collectedLabel, payload.selected ? `Squad paid ${payload.selected.squadPaidLabel}` : "0 player payments");
  setDashboardCard("Player payments outstanding", payload.cards.playerOutstandingLabel, payload.selected ? `Player links outstanding ${payload.selected.squadOpenLabel}` : "0 unpaid players");
  setDashboardCard("Ledger still to cover", payload.cards.ledgerStillToCoverLabel, payload.selected ? "Team charge minus counted payments." : "No action needed.");

  const allocation = Array.from(document.querySelectorAll<HTMLElement>("section.rounded-3xl"))
    .find((section) => section.textContent?.includes("Allocation and payment check"));
  const allocationParagraph = allocation?.querySelectorAll("p")[0] ?? null;
  if (allocationParagraph) allocationParagraph.textContent = payload.cards.allocationText;

  updateLedgerFixtureList(payload);
  updateLedgerCreatePanel(payload);
  document.documentElement.dataset.squadPaymentsLedgerLoaded = teamId;
}

export default function SquadPaymentAmountSync() {
  useEffect(() => {
    const defaultInput = getDefaultInput();

    if (!defaultInput) return;

    const initialiseInputs = () => {
      const currentDefault = normaliseAmount(defaultInput.value) ?? "0.00";

      for (const input of getAmountInputs()) {
        const currentValue = normaliseAmount(input.value);
        input.dataset.lastSyncedDefault = currentDefault;
        input.dataset.customAmount = currentValue === currentDefault ? "false" : "true";
        ensureCollectionMethodControls(input, defaultInput);
        updateStatusBadgeText(input);
      }
    };

    const handlePlayerAmountInput = (event: Event) => {
      const input = event.currentTarget as HTMLInputElement;
      const currentDefault = normaliseAmount(defaultInput.value);
      const currentValue = normaliseAmount(input.value);

      if (!currentDefault || !currentValue) {
        input.dataset.customAmount = "true";
        return;
      }

      input.dataset.customAmount = currentValue === currentDefault ? "false" : "true";
    };

    const handleDefaultInput = () => {
      const nextDefault = normaliseAmount(defaultInput.value);
      if (!nextDefault) return;

      for (const input of getAmountInputs()) {
        if (input.disabled) continue;
        if (getSelectedCollectionMethod(input) === "waived") continue;

        const currentValue = normaliseAmount(input.value);
        const previousDefault = input.dataset.lastSyncedDefault;
        const isCustomAmount = input.dataset.customAmount === "true";
        const stillOnPreviousDefault = Boolean(
          previousDefault && currentValue && currentValue === previousDefault,
        );

        if (!isCustomAmount || stillOnPreviousDefault || !input.value.trim()) {
          input.value = nextDefault;
          input.dataset.customAmount = "false";
          input.dataset.lastSyncedDefault = nextDefault;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };

    initialiseInputs();

    defaultInput.addEventListener("input", handleDefaultInput);

    for (const input of getAmountInputs()) {
      input.addEventListener("input", handlePlayerAmountInput);
    }

    return () => {
      defaultInput.removeEventListener("input", handleDefaultInput);

      for (const input of getAmountInputs()) {
        input.removeEventListener("input", handlePlayerAmountInput);
      }
    };
  }, []);

  useEffect(() => {
    if (!window.location.pathname.includes("/player-payments")) return;

    const frame = window.requestAnimationFrame(() => void refreshLedgerFromServer().catch(() => undefined));
    const timer = window.setTimeout(() => void refreshLedgerFromServer().catch(() => undefined), 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
