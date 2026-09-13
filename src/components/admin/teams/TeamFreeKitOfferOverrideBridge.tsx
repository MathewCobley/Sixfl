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

type OfferStatus = {
  teamName: string;
  wantsFreeKit: boolean;
  originalRegistrationOffer: boolean;
  manuallyGranted: boolean;
  expired: boolean;
  expiredAt: string | null;
  hasExistingOrder: boolean;
  hasLiveOrder: boolean;
  hasExtraKitCharge: boolean;
};

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

        let data = (await response.json()) as OfferStatus;

        const card = document.createElement("section");
        card.dataset.teamFreeKitOfferOverride = "true";
        card.className =
          "mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4";

        const header = document.createElement("div");
        header.className = "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";

        const copy = document.createElement("div");
        copy.className = "min-w-0";
        const eyebrow = document.createElement("div");
        eyebrow.className = "text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70";
        eyebrow.textContent = "Free kit offer";
        const title = document.createElement("div");
        title.className = "mt-1 font-semibold text-white";
        const description = document.createElement("p");
        description.className = "mt-1 text-sm leading-5 text-white/55";
        const status = document.createElement("p");
        status.className = "mt-2 text-xs font-semibold text-amber-100/75";

        const badge = document.createElement("span");
        badge.className =
          "w-fit shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/65";

        copy.append(eyebrow, title, description, status);
        header.append(copy, badge);
        card.appendChild(header);

        const controls = document.createElement("div");
        controls.className = "mt-4 flex flex-col gap-3 border-t border-white/10 pt-4";
        card.appendChild(controls);

        const requestUpdate = async (payload: Record<string, unknown>) => {
          const save = await fetch(
            `/api/admin/teams/${encodeURIComponent(teamId)}/free-kit-offer-status`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            },
          );

          const next = (await save.json().catch(() => null)) as
            | (OfferStatus & { error?: string })
            | null;
          if (!save.ok || !next) {
            throw new Error(next?.error || "Could not save. Please try again.");
          }
          data = next;
        };

        const render = () => {
          controls.replaceChildren();
          const offerActive =
            !data.expired && (data.wantsFreeKit || data.originalRegistrationOffer);

          if (offerActive) {
            title.textContent = "✓ 7 complete kits included free";
            description.textContent =
              "This team has the SIXFL free-kit allocation. Additional complete kits cost £20 each.";
            if (data.originalRegistrationOffer) {
              badge.textContent = "Original registration";
              status.textContent = "FREE OFFER ON — 7 complete kits included";
            } else {
              badge.textContent = "Manually granted";
              status.textContent = "FREE OFFER ON — manually granted by SIXFL";
            }
          } else {
            title.textContent = "Free kit offer not applied / expired";
            description.textContent =
              "This team is currently on the normal paid-kit rules. You can manually grant the SIXFL offer here: 7 complete kits free, with additional kits at £20 each.";
            badge.textContent = "Normal paid kit rules";
            status.textContent = "NO FREE KIT ALLOCATION";
          }

          if (!offerActive) {
            const reason = document.createElement("input");
            reason.type = "text";
            reason.maxLength = 500;
            reason.placeholder = "Admin note (optional)";
            reason.className =
              "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-emerald-400/40";

            const grant = document.createElement("button");
            grant.type = "button";
            grant.className =
              "inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-black transition hover:bg-emerald-300";
            grant.textContent = "Grant 7 free kits";
            grant.addEventListener("click", async () => {
              if (!window.confirm(`Grant ${data.teamName} 7 complete kits free of charge?`)) return;
              grant.disabled = true;
              grant.textContent = "Granting…";
              try {
                await requestUpdate({ manualOffer: true, reason: reason.value.trim() });
                render();
              } catch (error) {
                status.textContent = error instanceof Error ? error.message : "Could not save. Please try again.";
                grant.disabled = false;
                grant.textContent = "Grant 7 free kits";
              }
            });

            controls.append(reason, grant);
          } else if (data.manuallyGranted) {
            const note = document.createElement("p");
            note.className = "text-xs leading-5 text-white/45";
            note.textContent = data.hasLiveOrder || data.hasExtraKitCharge
              ? "This manual offer cannot be removed because a live kit order or additional-kit charge already exists."
              : "This offer was manually granted. Removing it does not change the team, league, squad, fixtures or match payments.";
            controls.appendChild(note);

            if (!data.hasLiveOrder && !data.hasExtraKitCharge) {
              const remove = document.createElement("button");
              remove.type = "button";
              remove.className =
                "inline-flex min-h-10 w-fit items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15";
              remove.textContent = "Remove manually granted offer";
              remove.addEventListener("click", async () => {
                if (!window.confirm(`Remove the manually granted free-kit offer from ${data.teamName}?`)) return;
                remove.disabled = true;
                remove.textContent = "Removing…";
                try {
                  await requestUpdate({ manualOffer: false, reason: "Removed from Team settings" });
                  render();
                } catch (error) {
                  status.textContent = error instanceof Error ? error.message : "Could not save. Please try again.";
                  remove.disabled = false;
                  remove.textContent = "Remove manually granted offer";
                }
              });
              controls.appendChild(remove);
            }
          } else {
            const note = document.createElement("p");
            note.className = "text-xs leading-5 text-white/50";
            note.textContent =
              "This entitlement came from the team’s original registration. It is protected from accidental removal by the manual grant control.";
            controls.appendChild(note);
          }

          if (data.originalRegistrationOffer && !data.hasExistingOrder) {
            const expiryLabel = document.createElement("label");
            expiryLabel.className =
              "flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/55";
            const expiry = document.createElement("input");
            expiry.type = "checkbox";
            expiry.checked = data.expired;
            expiry.className = "mt-0.5 h-4 w-4 accent-amber-400";
            const expiryText = document.createElement("span");
            expiryText.textContent =
              "Mark the original offer as not applied / expired. This keeps the original registration request in the audit history.";
            expiry.addEventListener("change", async () => {
              expiry.disabled = true;
              try {
                await requestUpdate({ expired: expiry.checked });
                render();
              } catch (error) {
                expiry.checked = !expiry.checked;
                status.textContent = error instanceof Error ? error.message : "Could not save. Please try again.";
                expiry.disabled = false;
              }
            });
            expiryLabel.append(expiry, expiryText);
            controls.appendChild(expiryLabel);
          }
        };

        render();

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
