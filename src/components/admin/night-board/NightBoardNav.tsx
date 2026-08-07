"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function buildHref(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function NightBoardNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const contextParams = new URLSearchParams();
  for (const key of ["date", "leagueId", "venueId"]) {
    const value = searchParams.get(key)?.trim();
    if (value) contextParams.set(key, value);
  }

  const boardHref = buildHref("/admin/night-board", contextParams);
  const noFixtureHref = buildHref(
    "/admin/night-board/no-fixture-emails",
    contextParams,
  );

  const onNoFixtureEmails = pathname === "/admin/night-board/no-fixture-emails";

  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-sm">
      <Link
        href={boardHref}
        className={`rounded-xl border px-4 py-2 font-semibold transition ${
          !onNoFixtureEmails
            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
            : "border-white/10 bg-black/20 text-white/70 hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100"
        }`}
      >
        Night Board
      </Link>
      <Link
        href={noFixtureHref}
        className={`rounded-xl border px-4 py-2 font-semibold transition ${
          onNoFixtureEmails
            ? "border-sky-400/30 bg-sky-500/15 text-sky-50"
            : "border-sky-400/20 bg-sky-500/10 text-sky-100 hover:bg-sky-500/15"
        }`}
      >
        No fixture emails
      </Link>
    </nav>
  );
}
