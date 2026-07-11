// ========================================
// File: src/components/admin/teams/TeamCompetitionPickerBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function addSeasonWording() {
  const select = document.querySelector<HTMLSelectElement>('select[name="leagueId"]');
  if (!select || select.dataset.seasonWordingApplied === "true") return;

  const label = document.querySelector<HTMLLabelElement>('label[for="leagueId"]');
  if (label && label.textContent?.trim() === "League") {
    label.textContent = "Primary/current season";
  }

  const wrapper = select.closest(".space-y-2") as HTMLElement | null;
  if (wrapper && !wrapper.querySelector("[data-team-season-help]")) {
    const help = document.createElement("div");
    help.dataset.teamSeasonHelp = "true";
    help.className = "text-xs leading-5 text-amber-100/75";
    help.textContent = "This is the team’s default current-season link. Seasonal participation should be managed from the league season team list, not by moving teams every season.";
    wrapper.appendChild(help);
  }

  select.dataset.seasonWordingApplied = "true";
}

export default function TeamCompetitionPickerBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/admin/teams/")) return;

    const frame = window.requestAnimationFrame(addSeasonWording);
    const timer = window.setTimeout(addSeasonWording, 500);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
