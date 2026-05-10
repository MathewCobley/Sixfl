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
      <div class="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-5">
        <div class="text-sm font-semibold text-emerald-200">Weekly match fee</div>
        <div class="mt-2 flex items-end gap-2">
          <span class="text-5xl font-black tracking-tight text-white">£6</span>
          <span class="pb-2 text-sm font-medium text-white/65">per player, per match</span>
        </div>
        <p class="mt-3 text-sm leading-6 text-white/65">Simple weekly pricing. Players only pay when they are due to play.</p>
      </div>
      <div class="mt-4 grid gap-3 text-sm text-white/70">
        <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <span>Cost per match</span>
          <span class="font-semibold text-white">£6</span>
        </div>
        <div class="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
          <span>Payment type</span>
          <span class="font-semibold text-white">Player match fee</span>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span>Paid</span>
          <span class="font-semibold text-white">Weekly</span>
        </div>
      </div>
    `;
  }
}

export default function PublicLeagueLandingSpacingBridge() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/leagues/")) return;

    replaceSnapshotWithPricing();

    const observer = new MutationObserver(() => {
      replaceSnapshotWithPricing();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
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
