// ========================================
// File: src/components/captain/VoidTeamChargeBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function getTeamIdFromPathname(pathname: string) {
  const match = pathname.match(/\/captain\/team\/([^/]+)\/payments\/?$/);
  return match?.[1] ?? null;
}

function removeExistingButtons() {
  document.querySelectorAll("[data-void-team-charge-button]").forEach((node) => node.remove());
}

function getChargeIdFromPayLink(link: HTMLAnchorElement) {
  const href = link.getAttribute("href") ?? "";
  const match = href.match(/\/pay\/charge\/([^/?#]+)/);
  return match?.[1] ?? null;
}

async function resolveChargeIdFromToken(token: string) {
  const response = await fetch(`/api/payments/charge-token/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { chargeId?: string };
  return data.chargeId ?? null;
}

function createButton(input: {
  teamId: string;
  chargeToken: string;
  onComplete: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.voidTeamChargeButton = "true";
  button.className =
    "inline-flex h-11 items-center justify-center rounded-2xl border border-red-400/25 bg-red-500/10 px-5 text-sm font-semibold text-red-100 transition hover:bg-red-500/15";
  button.textContent = "Void charge";

  button.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Void this unpaid team charge? This will cancel queued payment reminders. Paid charges will not be voided.",
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Voiding...";

    try {
      const chargeId = await resolveChargeIdFromToken(input.chargeToken);

      if (!chargeId) {
        throw new Error("Could not find this team charge.");
      }

      const response = await fetch(`/api/captain/team/${input.teamId}/payments/void-charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId,
          reason: "Game conceded / fixture not played",
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(data?.error ?? "Could not void team charge.");
      }

      window.alert("Team charge voided and queued payment reminders cancelled.");
      input.onComplete();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not void team charge.");
      button.disabled = false;
      button.textContent = "Void charge";
    }
  });

  return button;
}

export default function VoidTeamChargeBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    removeExistingButtons();

    const teamId = getTeamIdFromPathname(pathname);
    if (!teamId) return;

    const payLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/pay/charge/"]'),
    );

    for (const link of payLinks) {
      const token = getChargeIdFromPayLink(link);
      if (!token) continue;

      const wrapper = link.parentElement;
      if (!wrapper) continue;
      if (wrapper.querySelector("[data-void-team-charge-button]")) continue;

      const button = createButton({
        teamId,
        chargeToken: token,
        onComplete: () => router.refresh(),
      });

      wrapper.appendChild(button);
    }

    return () => {
      removeExistingButtons();
    };
  }, [pathname, router]);

  return null;
}
