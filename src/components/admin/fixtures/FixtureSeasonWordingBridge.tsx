// ========================================
// File: src/components/admin/fixtures/FixtureSeasonWordingBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function replaceExactText(root: ParentNode, from: string, to: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent?.trim() === from) {
      nodes.push(node);
    }
  }

  for (const node of nodes) {
    node.textContent = (node.textContent ?? "").replace(from, to);
  }
}

function applyFixtureSeasonWording() {
  const root = document.querySelector("main");
  if (!root || root.getAttribute("data-fixture-season-wording") === "true") return;

  replaceExactText(root, "Choose league and division", "Choose current season and division");
  replaceExactText(root, "League", "Current season");

  const paragraphs = Array.from(root.querySelectorAll("p"));
  for (const paragraph of paragraphs) {
    const text = paragraph.textContent ?? "";

    if (text.includes("Pick the league, division, visibility and status.")) {
      paragraph.textContent = "Pick the current season, division, visibility and status. Postponed fixtures can be isolated here and then opened from the fixture cards to rearrange them.";
    }

    if (text.includes("Publishing is locked to the selected league and division.")) {
      paragraph.textContent = text.replace(
        "Publishing is locked to the selected league and division.",
        "Publishing is locked to the selected season and division.",
      );
    }
  }

  root.setAttribute("data-fixture-season-wording", "true");
}

export default function FixtureSeasonWordingBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/fixtures") return;

    const frame = window.requestAnimationFrame(applyFixtureSeasonWording);
    const timer = window.setTimeout(applyFixtureSeasonWording, 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
