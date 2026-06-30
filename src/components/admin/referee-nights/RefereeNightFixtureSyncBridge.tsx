// ========================================
// File: src/components/admin/referee-nights/RefereeNightFixtureSyncBridge.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function shouldSyncOnPath(pathname: string) {
  return pathname.startsWith("/admin/fixtures") || pathname.startsWith("/admin/referee-nights");
}

export default function RefereeNightFixtureSyncBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!shouldSyncOnPath(pathname)) return;

    let cancelled = false;

    async function syncRefereeNights() {
      try {
        const response = await fetch("/api/admin/referee-nights/sync-published-fixtures", {
          method: "POST",
          cache: "no-store",
        });

        if (!response.ok || cancelled) return;

        const payload = (await response.json().catch(() => null)) as {
          affectedNights?: number;
        } | null;

        if (!cancelled && (payload?.affectedNights ?? 0) > 0) {
          router.refresh();
        }
      } catch {
        // Do not block admin pages if the background sync cannot run.
      }
    }

    void syncRefereeNights();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
