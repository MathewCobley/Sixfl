"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

let lastCaptainPathname: string | null = null;

/**
 * Captain team layouts persist while moving between team pages. Reset the browser
 * to the top whenever the pathname changes so opening a team never inherits the
 * previous page's scroll position. Query-only changes deliberately keep position,
 * and hash links (for example the league table) keep their normal anchor scroll.
 */
export default function CaptainTeamScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    const pathnameChanged = lastCaptainPathname !== pathname;
    lastCaptainPathname = pathname;

    if (!pathnameChanged || window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
