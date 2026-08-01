"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type AdjustmentPlayer = {
  playerMatchFeeId: string;
  teamMemberId: string;
  name: string;
  email: string | null;
  amountPence: number;
  editHref: string;
};

type Adjustment = {
  chargeId: string;
  chargeTitle: string;
  fixtureId: string;
  fixtureLabel: string;
  amountPence: number;
  players: AdjustmentPlayer[];
  collectionHref: string;
};

type ReconciliationResponse = {
  changed?: boolean;
  removedStaleAdjustmentChargeIds?: string[];
  adjustments?: Adjustment[];
};

function formatMoney(amountPence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amountPence / 100);
}

function getTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/payments\/?$/)?.[1] ?? null;
}

function findLedgerSection() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
    (element) => element.textContent?.trim() === "Team payment ledger",
  );
  return heading?.closest<HTMLElement>("section") ?? null;
}

function ensureRepairNotice(removedCount: number) {
  const ledger = findLedgerSection();
  if (!ledger || removedCount <= 0) return;
  if (ledger.querySelector("[data-zero-fee-repair-notice]")) return;

  const notice = document.createElement("div");
  notice.dataset.zeroFeeRepairNotice = "true";
  notice.className =
    "m-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:m-6";
  notice.textContent =
    "The zero-fee adjustment was checked and removed because no current squad player has a £0 player-fee override.";

  const header = ledger.firstElementChild;
  header?.insertAdjacentElement("afterend", notice);
}

function buildPlayerRow(player: AdjustmentPlayer) {
  const row = document.createElement("div");
  row.className =
    "flex flex-col gap-2 border-t border-amber-300/10 px-3 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between";

  const details = document.createElement("div");
  details.className = "min-w-0";

  const name = document.createElement("div");
  name.className = "font-semibold text-white";
  name.textContent = player.name;
  details.appendChild(name);

  if (player.email) {
    const email = document.createElement("div");
    email.className = "mt-0.5 break-all text-xs text-white/50";
    email.textContent = player.email;
    details.appendChild(email);
  }

  const actions = document.createElement("div");
  actions.className = "flex shrink-0 items-center gap-3";

  const amount = document.createElement("span");
  amount.className = "text-sm font-semibold text-amber-100";
  amount.textContent = `${formatMoney(player.amountPence)} removed`;
  actions.appendChild(amount);

  const editLink = document.createElement("a");
  editLink.href = player.editHref;
  editLink.className =
    "inline-flex min-h-9 items-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/75 hover:border-emerald-400/30 hover:text-emerald-100";
  editLink.textContent = "View / edit player";
  actions.appendChild(editLink);

  row.appendChild(details);
  row.appendChild(actions);
  return row;
}

function applyAdjustmentDetails(adjustments: Adjustment[]) {
  const ledger = findLedgerSection();
  if (!ledger) return;

  ledger.querySelectorAll("[data-zero-fee-adjustment-detail]").forEach((node) => node.remove());

  for (const adjustment of adjustments) {
    const title = Array.from(
      ledger.querySelectorAll<HTMLElement>("div.text-base.font-semibold"),
    ).find((element) => element.textContent?.trim() === adjustment.chargeTitle);
    const card = title?.closest<HTMLElement>("div.px-6.py-5") ?? null;
    const leftColumn = title?.closest<HTMLElement>("div.min-w-0") ?? null;
    if (!card || !leftColumn) continue;

    const panel = document.createElement("div");
    panel.dataset.zeroFeeAdjustmentDetail = adjustment.chargeId;
    panel.className =
      "mt-4 overflow-hidden rounded-2xl border border-amber-400/25 bg-amber-500/10";

    const header = document.createElement("div");
    header.className = "px-3 py-3";

    const label = document.createElement("div");
    label.className =
      "text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-100/65";
    label.textContent = "Zero-fee player adjustment";
    header.appendChild(label);

    const explanation = document.createElement("div");
    explanation.className = "mt-1 text-sm text-amber-50/80";
    explanation.textContent = `${formatMoney(adjustment.amountPence)} has been removed from this fixture fee because the player fee override below is set to £0.00.`;
    header.appendChild(explanation);
    panel.appendChild(header);

    const list = document.createElement("div");
    list.className = "border-t border-amber-300/15";
    for (const player of adjustment.players) {
      list.appendChild(buildPlayerRow(player));
    }
    panel.appendChild(list);

    const footer = document.createElement("div");
    footer.className = "border-t border-amber-300/15 px-3 py-3";
    const collectionLink = document.createElement("a");
    collectionLink.href = adjustment.collectionHref;
    collectionLink.className =
      "text-xs font-semibold text-amber-100 underline decoration-amber-300/40 underline-offset-4";
    collectionLink.textContent = "Open this fixture's player payment collection";
    footer.appendChild(collectionLink);
    panel.appendChild(footer);

    leftColumn.appendChild(panel);
  }
}

export default function ZeroFeePlayerAdjustmentBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const teamId = getTeamId(pathname);
    if (!teamId) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    fetch(`/api/captain/team/${encodeURIComponent(teamId)}/zero-fee-adjustments`, {
      method: "POST",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | ReconciliationResponse
          | null;
        if (cancelled || !response.ok || !payload) return;

        const adjustments = payload.adjustments ?? [];
        const removedCount = payload.removedStaleAdjustmentChargeIds?.length ?? 0;
        const apply = () => {
          ensureRepairNotice(removedCount);
          applyAdjustmentDetails(adjustments);
        };

        apply();
        observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });

        if (payload.changed) {
          router.refresh();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [pathname, router]);

  return null;
}
