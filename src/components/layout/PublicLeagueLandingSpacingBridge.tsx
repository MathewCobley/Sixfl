// ========================================
// File: src/components/layout/PublicLeagueLandingSpacingBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function replaceSnapshotWithPricing() {
  const snapshotHeadings = Array.from(document.querySelectorAll("p")).filter(
    (element) => element.textContent?.trim().toUpperCase() === "SNAPSHOT",
  );

  for (const heading of snapshotHeadings) {
    const card = heading.closest("div.rounded-3xl");
    if (!card || card.getAttribute("data-sixfl-pricing-card") === "true") continue;

    card.setAttribute("data-sixfl-pricing-card", "true");
    card.innerHTML = `
      <p class="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Player pricing</p>
      <h2 class="mt-4 text-2xl font-bold text-white sm:text-3xl">Simple weekly pricing</h2>
      <div class="mt-6 rounded-3xl border border-white/10 bg-black/25 p-6">
        <div class="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span class="text-5xl font-black tracking-tight text-white">£6</span>
          <span class="pb-2 text-base font-bold text-white/55">per player / match</span>
        </div>
        <p class="mt-5 text-base leading-7 text-white/70">A simple weekly player match fee. Players only pay when they are due to play, with a secure payment link sent directly to them.</p>
      </div>
      <div class="mt-5 grid gap-3 text-sm text-white/80">
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">£6 per player, per match</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">Secure online payment link</div>
        <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">Only charged when selected to play</div>
      </div>
    `;
  }
}

function ensureRegisterModalCloseButton(registerSection: HTMLElement) {
  if (registerSection.querySelector(".sixfl-register-modal-close")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "sixfl-register-modal-close";
  button.setAttribute("aria-label", "Close registration form");
  button.textContent = "Close";
  button.addEventListener("click", () => {
    document.body.classList.remove("sixfl-register-modal-open");
  });

  registerSection.prepend(button);
}

function openRegisterModal() {
  const registerSection = document.getElementById("register");
  if (!registerSection) return;

  ensureRegisterModalCloseButton(registerSection);
  document.body.classList.add("sixfl-register-modal-open");
}

export default function PublicLeagueLandingSpacingBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/leagues/")) return;

    replaceSnapshotWithPricing();

    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const registerLink = target?.closest('a[href="#register"]');

      if (registerLink) {
        event.preventDefault();
        openRegisterModal();
        return;
      }

      if (
        document.body.classList.contains("sixfl-register-modal-open") &&
        event.target instanceof HTMLElement &&
        event.target.id === "register"
      ) {
        document.body.classList.remove("sixfl-register-modal-open");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        document.body.classList.remove("sixfl-register-modal-open");
      }
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    const observer = new MutationObserver(() => {
      replaceSnapshotWithPricing();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("sixfl-register-modal-open");
    };
  }, [pathname]);

  if (!pathname?.startsWith("/leagues/")) {
    return null;
  }

  return (
    <style jsx global>{`
      main > div.min-h-screen > section:first-child.relative.isolate {
        min-height: auto !important;
      }

      main > div.min-h-screen > section:first-child.relative.isolate > div.relative {
        min-height: auto !important;
        align-items: flex-start !important;
        padding-top: 2rem !important;
        padding-bottom: 2rem !important;
      }

      main > div.min-h-screen > section:first-child.relative.isolate + section {
        margin-top: 0 !important;
      }

      body.sixfl-register-modal-open {
        overflow: hidden !important;
      }

      body.sixfl-register-modal-open #register {
        position: fixed !important;
        inset: 0 !important;
        z-index: 9999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow-y: auto !important;
        margin: 0 !important;
        padding: 1rem !important;
        background: radial-gradient(circle at top, rgba(16, 185, 129, 0.18), transparent 34%), rgba(0, 0, 0, 0.84) !important;
        backdrop-filter: blur(14px) !important;
      }

      body.sixfl-register-modal-open #register > :not(.sixfl-register-modal-close) {
        width: min(920px, 100%) !important;
        max-height: calc(100vh - 2rem) !important;
        overflow-y: auto !important;
        border-radius: 1.75rem !important;
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.58) !important;
      }

      .sixfl-register-modal-close {
        position: fixed !important;
        top: 1rem !important;
        right: 1rem !important;
        z-index: 10000 !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        border-radius: 999px !important;
        background: rgba(0, 0, 0, 0.72) !important;
        color: white !important;
        padding: 0.75rem 1rem !important;
        font-size: 0.875rem !important;
        font-weight: 700 !important;
        cursor: pointer !important;
      }

      .sixfl-register-modal-close:hover {
        background: rgba(16, 185, 129, 0.18) !important;
        border-color: rgba(16, 185, 129, 0.38) !important;
      }

      @media (min-width: 640px) {
        main > div.min-h-screen > section:first-child.relative.isolate > div.relative {
          padding-top: 2.5rem !important;
          padding-bottom: 2.5rem !important;
        }
      }

      @media (min-width: 1024px) {
        #table > div:first-child {
          padding-top: 1.25rem !important;
          padding-bottom: 1.25rem !important;
        }

        #table > div:first-child h2 {
          margin-top: 0.5rem !important;
          font-size: 1.65rem !important;
          line-height: 2rem !important;
        }

        #table > div:first-child p:last-child {
          margin-top: 0.5rem !important;
          max-width: 46rem !important;
          font-size: 0.9rem !important;
          line-height: 1.45rem !important;
        }

        #table .lg\\:min-w-\\[1240px\\] {
          min-width: 1040px !important;
        }

        #table .hidden.grid-cols-\\[72px_minmax\\(280px\\,2fr\\)_170px_72px_72px_72px_72px_84px_84px_84px_92px\\] {
          grid-template-columns: 56px minmax(260px, 2fr) 190px 52px 52px 52px 52px 60px 60px 60px 64px !important;
          gap: 0.75rem !important;
          padding-top: 0.75rem !important;
          padding-bottom: 0.75rem !important;
        }

        #table .divide-y > div {
          padding-top: 0.6rem !important;
          padding-bottom: 0.6rem !important;
        }

        #table .divide-y > div > div.hidden {
          grid-template-columns: 56px minmax(260px, 2fr) 190px 52px 52px 52px 52px 60px 60px 60px 64px !important;
          gap: 0.75rem !important;
        }

        #table .divide-y > div > div.hidden > div:nth-child(3) {
          flex-wrap: nowrap !important;
          gap: 0.35rem !important;
        }

        #table .divide-y > div > div.hidden > div:nth-child(3) span {
          width: 1.5rem !important;
          height: 1.5rem !important;
          border-radius: 0.4rem !important;
          font-size: 0.68rem !important;
        }
      }
    `}</style>
  );
}
