// ========================================
// File: src/components/player/PlayerMatchFeePaymentLinkBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function getTeamIdFromPath(pathname: string) {
  const match = pathname.match(/\/player\/team\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

export default function PlayerMatchFeePaymentLinkBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const teamId = getTeamIdFromPath(pathname);
    if (!teamId) return;

    let cancelled = false;

    async function ensureLinks() {
      try {
        const response = await fetch(
          `/api/player/team/${teamId}/match-fees/ensure-payment-links`,
          {
            method: "POST",
          },
        );

        if (!response.ok) return;

        const data = (await response.json()) as { updated?: number };

        if (!cancelled && data.updated && data.updated > 0) {
          router.refresh();
        }
      } catch {
        // Do not interrupt the player dashboard if link generation fails.
      }
    }

    ensureLinks();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
