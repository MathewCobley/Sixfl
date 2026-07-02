// ========================================
// File: src/components/captain/CaptainOutstandingBalanceBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type OutstandingBalancePayload = {
  outstandingPence: number;
  outstandingLabel: string;
  itemCount: number;
  helper: string;
};

function getTeamIdFromPathname(pathname: string | null) {
  const match = pathname?.match(/^\/captain\/team\/([^/]+)(?:\/)?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function findOutstandingBalanceCard() {
  const candidates = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/payments"]'));

  return candidates.find((candidate) =>
    candidate.textContent?.toLowerCase().includes("outstanding balance"),
  ) ?? null;
}

async function refreshOutstandingBalance(pathname: string | null) {
  const teamId = getTeamIdFromPathname(pathname);
  if (!teamId) return;

  const card = findOutstandingBalanceCard();
  if (!card || card.dataset.outstandingBalanceLoaded === teamId) return;

  try {
    const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/outstanding-balance`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const payload = (await response.json()) as OutstandingBalancePayload;
    const paragraphs = Array.from(card.querySelectorAll("p"));
    const value = paragraphs.find((paragraph) =>
      paragraph.className.includes("text-3xl"),
    );
    const helper = paragraphs.at(-1) ?? null;

    if (value) {
      value.textContent = payload.outstandingLabel;
    }

    if (helper) {
      helper.textContent = payload.helper;
    }

    card.dataset.outstandingBalanceLoaded = teamId;
  } catch {
    // Keep server-rendered balance if this enhancement fails.
  }
}

export default function CaptainOutstandingBalanceBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/captain/team/")) return;

    const frame = window.requestAnimationFrame(() => {
      void refreshOutstandingBalance(pathname);
    });
    const timer = window.setTimeout(() => {
      void refreshOutstandingBalance(pathname);
    }, 700);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
