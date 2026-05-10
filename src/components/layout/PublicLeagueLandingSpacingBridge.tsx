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
    `}</style>
  );
}
