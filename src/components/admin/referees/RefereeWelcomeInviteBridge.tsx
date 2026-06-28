// ========================================
// File: src/components/admin/referees/RefereeWelcomeInviteBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getRefereeIdFromHref(href: string | null) {
  if (!href) return null;
  const match = href.match(/^\/admin\/referees\/([^/#?]+)\/?(?:[#?].*)?$/);
  return match?.[1] ?? null;
}

function makeInviteButton(refereeId: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.refereeWelcomeInvite = refereeId;
  button.textContent = "Welcome email";
  button.className =
    "inline-flex h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-60";

  button.addEventListener("click", async () => {
    const originalText = button.textContent || "Welcome email";
    button.disabled = true;
    button.textContent = "Queuing...";

    try {
      const response = await fetch(`/api/admin/referees/${encodeURIComponent(refereeId)}/welcome-invite`, {
        method: "POST",
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not queue welcome email.");
      }

      button.textContent = "Welcome queued";
      button.className =
        "inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60";
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : "Could not queue";
      button.className =
        "inline-flex h-10 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60";
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
        button.className =
          "inline-flex h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-60";
      }, 3500);
    }
  });

  return button;
}

function injectInviteButtons() {
  const editLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).filter((link) =>
    link.textContent?.trim() === "Edit referee" || link.textContent?.trim() === "Comms",
  );

  const seen = new Set<string>();

  for (const link of editLinks) {
    const href = link.getAttribute("href");
    const refereeId = getRefereeIdFromHref(href);
    if (!refereeId || seen.has(refereeId)) continue;

    const actionRow = link.parentElement;
    if (!actionRow || actionRow.querySelector(`[data-referee-welcome-invite="${refereeId}"]`)) continue;

    const commsLink = Array.from(actionRow.querySelectorAll<HTMLAnchorElement>("a")).find(
      (item) => item.textContent?.trim() === "Comms",
    );

    const button = makeInviteButton(refereeId);

    if (commsLink?.nextSibling) {
      actionRow.insertBefore(button, commsLink.nextSibling);
    } else {
      actionRow.appendChild(button);
    }

    seen.add(refereeId);
  }
}

export default function RefereeWelcomeInviteBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/admin/referees")) return;

    const frame = window.requestAnimationFrame(injectInviteButtons);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
