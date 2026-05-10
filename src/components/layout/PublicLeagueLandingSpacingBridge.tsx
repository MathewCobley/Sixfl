// ========================================
// File: src/components/layout/PublicLeagueLandingSpacingBridge.tsx
// ========================================

"use client";

import { usePathname } from "next/navigation";

export default function PublicLeagueLandingSpacingBridge() {
  const pathname = usePathname();

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
