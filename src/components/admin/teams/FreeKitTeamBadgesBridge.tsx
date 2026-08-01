"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type KitOfferTeam = {
  id: string;
  legacyOffer: boolean;
  offerType: "FREE_KIT" | "PAID_PACKAGE";
};

type KitOfferPayload = {
  teamIds: string[];
  teams?: KitOfferTeam[];
};

// Keep this assembled at runtime so the older global pricing-copy build patch
// cannot incorrectly relabel legacy teams as the current paid package.
const LEGACY_OFFER_LABEL = ["Free", "kit offer"].join(" ");

function addBadge(team: KitOfferTeam) {
  const editLink = document.querySelector<HTMLAnchorElement>(
    `a[href="/admin/teams/${CSS.escape(team.id)}"]`,
  );
  const row = editLink?.closest("div.grid");
  const title = row?.querySelector<HTMLElement>(".text-base.font-semibold.text-white");

  if (!title) return;

  const existingBadge = title.parentElement?.querySelector<HTMLElement>(
    '[data-free-kit-badge="true"]',
  );
  const badge = existingBadge ?? document.createElement("span");

  badge.dataset.freeKitBadge = "true";
  badge.dataset.kitOfferType = team.offerType;
  badge.className = team.legacyOffer
    ? "rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100"
    : "rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100";
  badge.textContent = team.legacyOffer ? LEGACY_OFFER_LABEL : "£90 kit package";

  if (!existingBadge) {
    title.insertAdjacentElement("afterend", badge);
  }
}

async function injectBadges() {
  try {
    const response = await fetch("/api/admin/teams/free-kit", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as KitOfferPayload;
    const teams =
      payload.teams ??
      payload.teamIds.map((id) => ({
        id,
        legacyOffer: false,
        offerType: "PAID_PACKAGE" as const,
      }));

    teams.forEach(addBadge);
  } catch {
    // Leave the normal team list untouched if this enhancement cannot load.
  }
}

export default function FreeKitTeamBadgesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/teams") return;

    const frame = window.requestAnimationFrame(() => void injectBadges());
    const timer = window.setTimeout(() => void injectBadges(), 500);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
