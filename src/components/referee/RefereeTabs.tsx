// ========================================
// File: src/components/referee/RefereeTabs.tsx
// ========================================

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type RefereeTabKey = "overview" | "availability" | "match-rules";

type Props = {
  active: RefereeTabKey;
  previewRefereeId?: string | null;
};

const tabs: Array<{
  key: RefereeTabKey;
  href: string;
  label: string;
  description: string;
}> = [
  {
    key: "overview",
    href: "/referee",
    label: "Overview",
    description: "Nights, fees and cashup",
  },
  {
    key: "availability",
    href: "/referee/availability",
    label: "Availability",
    description: "Mark dates you can ref",
  },
  {
    key: "match-rules",
    href: "/referee/match-rules",
    label: "Match rules",
    description: "How SIXFL games run",
  },
];

function withPreviewRoute(href: string, previewRefereeId?: string | null) {
  if (!previewRefereeId) return href;

  return `/admin/referees/${encodeURIComponent(previewRefereeId)}/referee-preview?to=${encodeURIComponent(href)}`;
}

function getPreviewIdFromBanner() {
  if (typeof document === "undefined") return null;

  const exitLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find((link) =>
    /\/admin\/referees\/[^/]+\/referee-preview\/exit/.test(link.getAttribute("href") ?? ""),
  );

  const href = exitLink?.getAttribute("href") ?? "";
  return href.match(/\/admin\/referees\/([^/]+)\/referee-preview\/exit/)?.[1] ?? null;
}

function isRefereeAppHref(href: string) {
  return href === "/referee" || href.startsWith("/referee/");
}

export default function RefereeTabs({ active, previewRefereeId }: Props) {
  const searchParams = useSearchParams();
  const previewFromQuery = searchParams.get("previewRefereeId");
  const [previewFromBanner, setPreviewFromBanner] = useState<string | null>(null);
  const effectivePreviewRefereeId = previewRefereeId || previewFromQuery || previewFromBanner;

  useEffect(() => {
    setPreviewFromBanner(getPreviewIdFromBanner());
  }, []);

  useEffect(() => {
    if (!effectivePreviewRefereeId) return;

    const rewriteRefereeLinks = () => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href^='/referee']"));

      for (const link of links) {
        const href = link.getAttribute("href") ?? "";
        if (!isRefereeAppHref(href)) continue;
        link.setAttribute("href", withPreviewRoute(href, effectivePreviewRefereeId));
      }
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!(target instanceof HTMLAnchorElement)) return;

      const href = target.getAttribute("href") ?? "";
      if (!isRefereeAppHref(href)) return;

      event.preventDefault();
      window.location.href = withPreviewRoute(href, effectivePreviewRefereeId);
    };

    rewriteRefereeLinks();
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [effectivePreviewRefereeId]);

  const renderedTabs = useMemo(
    () =>
      tabs.map((tab) => ({
        ...tab,
        href: withPreviewRoute(tab.href, effectivePreviewRefereeId),
      })),
    [effectivePreviewRefereeId],
  );

  return (
    <nav className="grid gap-3 sm:grid-cols-3">
      {renderedTabs.map((tab) => {
        const isActive = active === tab.key;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={[
              "rounded-3xl border p-4 transition",
              isActive
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-50"
                : "border-white/10 bg-white/[0.035] text-white/68 hover:border-white/20 hover:bg-white/[0.06] hover:text-white",
            ].join(" ")}
          >
            <div className="text-sm font-semibold">{tab.label}</div>
            <div className="mt-1 text-xs leading-5 text-white/45">{tab.description}</div>
          </Link>
        );
      })}
    </nav>
  );
}
