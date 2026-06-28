// ========================================
// File: src/components/referee/RefereeOnsiteColleaguesBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type OnsiteNight = {
  nightId: string;
  totalReferees: number;
  refereeNames: string[];
  coReferees: string[];
};

type OnsitePayload = {
  nights?: OnsiteNight[];
};

function findNightCard(nightId: string) {
  const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find((item) => {
    const href = item.getAttribute("href") ?? "";
    return href === `/referee/night/${nightId}` || href.endsWith(`/referee/night/${nightId}`);
  });

  return link?.closest("article") as HTMLElement | null;
}

function makeTextList(values: string[]) {
  if (values.length === 0) return "You are the only listed referee for this night.";
  if (values.length === 1) return `Refereeing with: ${values[0]}.`;

  const last = values[values.length - 1];
  const rest = values.slice(0, -1).join(", ");
  return `Refereeing with: ${rest} and ${last}.`;
}

function injectOnsiteRefs(nights: OnsiteNight[]) {
  for (const night of nights) {
    if (document.querySelector(`[data-referee-onsite-night="${night.nightId}"]`)) continue;

    const card = findNightCard(night.nightId);
    if (!card) continue;

    const panel = document.createElement("div");
    panel.dataset.refereeOnsiteNight = night.nightId;
    panel.className =
      "mt-4 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-sky-50/80";

    const count = document.createElement("div");
    count.className = "font-semibold text-white";
    count.textContent = `${night.totalReferees} referee${night.totalReferees === 1 ? "" : "s"} on site this night`;

    const names = document.createElement("div");
    names.className = "mt-1 text-sky-50/70";
    names.textContent = makeTextList(night.coReferees);

    const allNames = document.createElement("div");
    allNames.className = "mt-2 text-xs text-sky-50/45";
    allNames.textContent = `Listed referees: ${night.refereeNames.join(", ") || "Not set"}`;

    panel.appendChild(count);
    panel.appendChild(names);
    panel.appendChild(allNames);
    card.appendChild(panel);
  }
}

export default function RefereeOnsiteColleaguesBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/referee") return;

    let cancelled = false;

    async function load() {
      const response = await fetch("/api/referee/onsite-refs", { cache: "no-store" });
      if (!response.ok) return;

      const payload = (await response.json().catch(() => null)) as OnsitePayload | null;
      if (cancelled) return;

      injectOnsiteRefs(payload?.nights ?? []);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
