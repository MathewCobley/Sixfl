// ========================================
// File: src/app/captain/team/[teamid]/squad/WhatsAppSquadBadges.tsx
// ========================================

"use client";

import { useEffect } from "react";

type WhatsAppBadgeEntry = {
  id: string;
  name: string | null;
  email: string | null;
};

type WhatsAppSquadBadgesProps = {
  entries: WhatsAppBadgeEntry[];
};

function makeBadge() {
  const badge = document.createElement("span");
  badge.setAttribute("data-sixfl-whatsapp-badge", "true");
  badge.setAttribute("title", "Uses WhatsApp");
  badge.className =
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10";

  const image = document.createElement("img");
  image.src = "/WhatsApp-Logo.png";
  image.alt = "WhatsApp";
  image.className = "h-4 w-4 object-contain";

  badge.appendChild(image);

  return badge;
}

function getTextNodesContaining(value: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const matches: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent?.includes(value)) {
      matches.push(node);
    }
  }

  return matches;
}

function findSquadRowFromEmail(email: string) {
  const emailNodes = getTextNodesContaining(email);

  for (const node of emailNodes) {
    const parentElement = node.parentElement;
    const row = parentElement?.closest("div.flex.flex-col.gap-5.px-6.py-5");

    if (row instanceof HTMLElement) {
      return row;
    }
  }

  return null;
}

function findNameElement(row: HTMLElement, name: string | null, email: string | null) {
  const expectedLabel = (name || email || "Unnamed user").trim();
  if (!expectedLabel) return null;

  const candidates = Array.from(row.querySelectorAll("div"));

  return (
    candidates.find((candidate) => {
      const element = candidate as HTMLElement;
      return (
        element.textContent?.trim() === expectedLabel &&
        element.className.includes("font-semibold") &&
        element.className.includes("text-white")
      );
    }) ?? null
  );
}

function addWhatsAppBadges(entries: WhatsAppBadgeEntry[]) {
  for (const entry of entries) {
    if (!entry.email?.trim()) continue;

    const row = findSquadRowFromEmail(entry.email.trim());
    if (!row || row.querySelector("[data-sixfl-whatsapp-badge='true']")) continue;

    const nameElement = findNameElement(row, entry.name, entry.email);
    if (!nameElement) continue;

    nameElement.insertAdjacentElement("afterend", makeBadge());
  }
}

export default function WhatsAppSquadBadges({ entries }: WhatsAppSquadBadgesProps) {
  useEffect(() => {
    if (entries.length === 0) return;

    addWhatsAppBadges(entries);

    const observer = new MutationObserver(() => addWhatsAppBadges(entries));
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [entries]);

  return null;
}
