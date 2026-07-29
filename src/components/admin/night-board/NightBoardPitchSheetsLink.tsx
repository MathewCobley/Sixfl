// ========================================
// File: src/components/admin/night-board/NightBoardPitchSheetsLink.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

function buildNightBoardPdfHref(
  pathname: string,
  searchParams: ReturnType<typeof useSearchParams>,
) {
  const params = new URLSearchParams();

  for (const key of ["date", "leagueId", "venueId"] as const) {
    const value = searchParams.get(key)?.trim();
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

export default function NightBoardPitchSheetsLink() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tallyHref = useMemo(
    () => buildNightBoardPdfHref("/api/admin/night-board/pitch-tally-sheets", searchParams),
    [searchParams],
  );
  const fixturesHref = useMemo(
    () => buildNightBoardPdfHref("/api/admin/night-board/night-fixtures", searchParams),
    [searchParams],
  );

  if (pathname !== "/admin/night-board") return null;

  return (
    <div className="fixed bottom-36 right-5 z-[79] flex flex-col items-stretch gap-2 sm:right-6">
      <Link
        href={fixturesHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-sky-300/40 bg-sky-400 px-4 py-2.5 text-sm font-semibold text-black shadow-2xl backdrop-blur transition hover:bg-sky-300"
        aria-label="Open printable A4 landscape night fixtures PDF"
      >
        Print night fixtures
      </Link>
      <Link
        href={tallyHref}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black shadow-2xl backdrop-blur transition hover:bg-emerald-300"
        aria-label="Open printable A5 pitch tally sheets PDF"
      >
        Print A5 tally sheets
      </Link>
    </div>
  );
}
