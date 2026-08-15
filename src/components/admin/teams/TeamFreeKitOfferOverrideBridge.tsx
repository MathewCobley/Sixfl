"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getAdminTeamId(pathname: string) {
  return /^\/admin\/teams\/([^/]+)\/?$/.exec(pathname)?.[1] ?? null;
}

function findTeamSettingsHost() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3")).find(
    (element) => element.textContent?.trim() === "Team settings",
  );
  return heading?.parentElement ?? null;
}

export default function TeamFreeKitOfferOverrideBridge() {
  const pathname = usePathname();

  useEffect(() => {
    const teamId = getAdminTeamId(pathname);
    if (!teamId) return;

    const controller = new AbortController();
    let stopped = false;
    let attempts = 0;
    let timer: number | null = null;

    const install = async () => {
      if (stopped) return;
      if (document.querySelector("[data-team-free-kit-offer-override]")) return;

      attempts += 1;
      const host = findTeamSettingsHost();
      if (!host) {
        if (attempts < 20) timer = window.setTimeout(() => void install(), 150);
        return;
      }

      try {
        const response = await fetch(
          `/api/admin/teams/${encodeURIComponent(teamId)}/free-kit-offer-status`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          if (attempts < 20) timer = window.setTimeout(() => void install(), 150);
          return;
        }

        const data = (await response.json()) as {
          wantsFreeKit: boolean;
          expired: boolean;
          expiredAt: string | null;
          hasExistingOrder: boolean;
        };

        const card = document.createElement("section");
        card.dataset.teamFreeKitOfferOverride = "true";
        card.className =
          "mb-5 rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4";

        const label = document.createElement("label");
        label.className = "flex items-start justify-between gap-4";

        const copy = document.createElement("div");
        const title = document.createElement("div");
        title.className = "font-semibold text-white";
        title.textContent = "Free kit offer not applied / expired";

        const description = document.createElement("p");
        description.className = "mt-1 text-sm leading-5 text-white/55";
        description.textContent = data.hasExistingOrder
          ? "This team already has a kit order, so its existing kit entitlement is preserved. Paid additional kits remain available through the normal kit order."
          : "Tick this to remove the free-kit entitlement from this team. They can still order and pay for kits at the normal £20 per complete kit. The original free-kit request remains recorded for audit/history.";

        const status = document.createElement("p");
        status.className = "mt-2 text-xs font-semibold text-amber-100/75";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = data.expired;
        input.disabled = data.hasExistingOrder;
        input.className = "mt-1 h-5 w-5 accent-amber-400 disabled:opacity-40";

        const refreshStatus = () => {
          if (data.hasExistingOrder) {
            status.textContent = "EXISTING KIT ORDER — current entitlement preserved";
            return;
          }
          status.textContent = input.checked
            ? "FREE OFFER OFF — captain can still buy kits at £20 each"
            : data.wantsFreeKit
              ? "FREE OFFER ON — included kit allocation is available"
              : "NORMAL PAID KIT RULES APPLY";
        };
        refreshStatus();

        input.addEventListener("change", async () => {
          input.disabled = true;
          status.textContent = "Saving…";

          const save = await fetch(
            `/api/admin/teams/${encodeURIComponent(teamId)}/free-kit-offer-status`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ expired: input.checked }),
            },
          );

          if (!save.ok) {
            input.checked = !input.checked;
            const payload = (await save.json().catch(() => null)) as { error?: string } | null;
            status.textContent = payload?.error || "Could not save. Please try again.";
          } else {
            refreshStatus();
          }

          input.disabled = data.hasExistingOrder;
        });

        copy.append(title, description, status);
        label.append(copy, input);
        card.appendChild(label);

        const form = host.querySelector("form");
        if (form) host.insertBefore(card, form);
        else host.appendChild(card);
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      }
    };

    timer = window.setTimeout(() => void install(), 0);
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.querySelector("[data-team-free-kit-offer-override]")?.remove();
    };
  }, [pathname]);

  return null;
}
