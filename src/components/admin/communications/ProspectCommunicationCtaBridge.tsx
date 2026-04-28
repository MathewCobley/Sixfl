// ========================================
// File: src/components/admin/communications/ProspectCommunicationCtaBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type CtaItem = {
  id: string;
  subject: string;
  label: string;
  url: string;
  occurredAt: string;
};

function getProspectIdFromPath(pathname: string) {
  const match = pathname.match(/\/admin\/teams\/[^/]+\/prospects\/([^/]+)\/communications\/?$/);
  return match?.[1] ?? null;
}

function removeExistingPanel() {
  document.querySelector("[data-prospect-email-cta-panel]")?.remove();
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function createPanel(items: CtaItem[]) {
  const panel = document.createElement("section");
  panel.dataset.prospectEmailCtaPanel = "true";
  panel.className =
    "rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)]";

  const title = document.createElement("div");
  title.className = "text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80";
  title.textContent = "Sent email action links";

  const helper = document.createElement("p");
  helper.className = "mt-2 max-w-3xl text-sm text-white/65";
  helper.textContent =
    "These are the CTA links that were attached to sent emails. They are shown here as a reliable fallback when the email body preview only shows the plain text version.";

  const list = document.createElement("div");
  list.className = "mt-4 grid gap-3";

  for (const item of items) {
    const card = document.createElement("div");
    card.className =
      "rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-white/75";

    const heading = document.createElement("div");
    heading.className = "font-semibold text-white";
    heading.textContent = item.subject;

    const meta = document.createElement("div");
    meta.className = "mt-1 text-xs text-white/45";
    meta.textContent = formatDate(item.occurredAt);

    const button = document.createElement("a");
    button.href = item.url;
    button.target = "_blank";
    button.rel = "noreferrer";
    button.className =
      "mt-3 inline-flex items-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400";
    button.textContent = item.label;

    const url = document.createElement("div");
    url.className = "mt-2 break-all text-xs text-emerald-100/75";
    url.textContent = item.url;

    card.append(heading, meta, button, url);
    list.appendChild(card);
  }

  panel.append(title, helper, list);
  return panel;
}

export default function ProspectCommunicationCtaBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const prospectId = getProspectIdFromPath(pathname);
    removeExistingPanel();

    if (!prospectId) return;

    let cancelled = false;

    async function loadCtas() {
      try {
        const response = await fetch(`/api/admin/prospects/${prospectId}/communication-ctas`, {
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = (await response.json()) as { items?: CtaItem[] };
        const items = Array.isArray(data.items) ? data.items : [];

        if (cancelled || items.length === 0) return;

        const main = document.querySelector("main");
        if (!main) return;

        const existingPanel = document.querySelector("[data-prospect-email-cta-panel]");
        if (existingPanel) return;

        main.prepend(createPanel(items));
      } catch {
        // Do not block the communications page if the fallback lookup fails.
      }
    }

    loadCtas();

    return () => {
      cancelled = true;
      removeExistingPanel();
    };
  }, [pathname]);

  return null;
}
