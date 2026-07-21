// ========================================
// File: src/components/admin/night-board/NightBoardPitchSheetsLink.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function NightBoardPitchSheetsLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const href = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of ["date", "leagueId", "venueId"] as const) {
      const value = searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return `/api/admin/night-board/pitch-sheets${query ? `?${query}` : ""}`;
  }, [searchParams]);

  if (pathname !== "/admin/night-board") return null;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-36 right-5 z-[79] inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black shadow-2xl backdrop-blur transition hover:bg-emerald-300 sm:right-6"
      aria-label="Open printable A5 pitch sheets PDF"
    >
      Print A5 pitch sheets
    </Link>
  );
}
