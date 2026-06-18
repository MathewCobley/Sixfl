// ========================================
// File: src/components/player/PlayerDashboardCopyPolish.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const replacements = [
  ["Nothing due", "All paid up"],
  ["No outstanding player match fees are showing for you.", "No match fees are waiting for you right now."],
  ["No outstanding player match fees are showing for this player.", "No match fees are waiting right now."],
  ["open fee on your account.", "match fee waiting for you."],
  ["open fees on your account.", "match fees waiting for you."],
  ["open fee linked to this player account.", "match fee waiting."],
  ["open fees linked to this player account.", "match fees waiting."],
] as const;

function polishTextNode(node: Text) {
  let nextValue = node.nodeValue ?? "";

  for (const [from, to] of replacements) {
    nextValue = nextValue.replaceAll(from, to);
  }

  if (nextValue !== node.nodeValue) {
    node.nodeValue = nextValue;
  }
}

function polishPlayerDashboardCopy() {
  const root = document.querySelector("main") ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  let current = walker.nextNode();

  while (current) {
    if (current instanceof Text) {
      textNodes.push(current);
    }

    current = walker.nextNode();
  }

  textNodes.forEach(polishTextNode);
}

export default function PlayerDashboardCopyPolish() {
  const pathname = usePathname();

  useEffect(() => {
    polishPlayerDashboardCopy();
  }, [pathname]);

  return null;
}
