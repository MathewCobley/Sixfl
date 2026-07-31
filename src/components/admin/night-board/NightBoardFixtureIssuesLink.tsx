// ========================================
// File: src/components/admin/night-board/NightBoardFixtureIssuesLink.tsx
// ========================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NightBoardFixtureIssuesLink() {
  const pathname = usePathname();

  if (pathname !== "/admin/night-board") return null;

  return (
    <Link
      href="/admin/fixtures/issues"
      className="fixed right-5 top-[13.5rem] z-[79] inline-flex min-h-11 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-500/90 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl backdrop-blur transition hover:bg-sky-400 sm:right-6"
    >
      Open all fixture issues
    </Link>
  );
}
