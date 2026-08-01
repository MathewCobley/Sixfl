"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type KitPackagePayload = {
  teamIds: string[];
};

function addBadge(teamId: string) {
  const editLink = document.querySelector<HTMLAnchorElement>(
    `a[href="/admin/teams/${CSS.escape(teamId)}"]`,
  );
  const row = editLink?.closest("div.grid");
  const title = row?.querySelector<HTMLElement>(".text-base.font-semibold.text-white");

  if (!title || title.parentElement?.querySelector('[data-free-kit-badge="true"]')) return;

  const badge = document.createElement("span");
  badge.dataset.freeKitBadge = "true";
  badge.className =
    "rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100";
  badge.textContent = "£90 kit package";
  title.insertAdjacentElement("afterend", badge);
}

async function injectBadges() {
  try {
    const response = await fetch("/api/admin/teams/free-kit", { cache: "no-store" });
    if (!response.ok) return;

    const payload = (await response.json()) as KitPackagePayload;
    payload.teamIds.forEach(addBadge);
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
