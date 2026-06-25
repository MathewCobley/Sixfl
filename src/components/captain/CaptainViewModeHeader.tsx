// ========================================
// File: src/components/captain/CaptainViewModeHeader.tsx
// ========================================

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const CAPTAIN_PREVIEW_PARAM = "captainPreview";

const CAPTAIN_FACING_REPLACEMENTS = [
  {
    from: "Tick this when the player uses WhatsApp, so captains know payment links can be sent that way.",
    to: "Tick this if the player uses WhatsApp. This helps you know whether payment links can be sent that way.",
  },
  {
    from: "These details help captains send payment links and organise matchday squads.",
    to: "These details help you send payment links and organise matchday squads.",
  },
  {
    from: "This team is currently set as a standard team. Matchday player selection is intended for managed SIXFL squads.",
    to: "This page is optional for your team. Use it if you want to record who actually played and manage individual match fees. If you collect one team payment, you can ignore this page.",
  },
  {
    from: "Standard team fee",
    to: "Team match fee",
  },
  {
    from: "standard team fee",
    to: "team match fee",
  },
  {
    from: "Standard team",
    to: "Team-managed squad",
  },
] as const;

type CaptainAccessMode = "admin-preview" | "captain-preview" | "captain";

function getFullAdminHref(input: { pathname: string | null; teamId: string }) {
  const fallback = `/captain/team/${input.teamId}/squad`;
  const pathname = input.pathname || fallback;

  return pathname.replace(
    new RegExp(`/captain/team/${input.teamId}/captain-squad/?$`),
    `/captain/team/${input.teamId}/squad`,
  );
}

function getExitCaptainPreviewHref(input: {
  pathname: string | null;
  searchParamsKey: string;
  teamId: string;
}) {
  const pathname = input.pathname || `/captain/team/${input.teamId}`;
  const currentPath = `${pathname}${input.searchParamsKey ? `?${input.searchParamsKey}` : ""}`;

  return `/admin/teams/${input.teamId}/captain-preview/exit?to=${encodeURIComponent(currentPath)}`;
}

function applyCaptainPreviewToHref(input: { href: string; teamId: string }) {
  const url = new URL(input.href, window.location.origin);
  const teamPrefix = `/captain/team/${input.teamId}`;

  if (url.origin !== window.location.origin) {
    return input.href;
  }

  if (!url.pathname.startsWith(teamPrefix)) {
    return input.href;
  }

  if (url.pathname === `${teamPrefix}/squad`) {
    url.pathname = `${teamPrefix}/captain-squad`;
  }

  url.searchParams.set(CAPTAIN_PREVIEW_PARAM, "1");

  return `${url.pathname}${url.search}${url.hash}`;
}

function rewriteCaptainFacingText() {
  const root = document.querySelector(".captain-team-shell") ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const skipParents = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION"]);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parentName = node.parentElement?.tagName;

    if (parentName && skipParents.has(parentName)) continue;
    if (node.textContent?.trim()) {
      textNodes.push(node as Text);
    }
  }

  for (const node of textNodes) {
    let nextText = node.textContent ?? "";

    for (const replacement of CAPTAIN_FACING_REPLACEMENTS) {
      nextText = nextText.split(replacement.from).join(replacement.to);
    }

    if (nextText !== node.textContent) {
      node.textContent = nextText;
    }
  }
}

export default function CaptainViewModeHeader({
  teamId,
  isAdmin,
  isManagedTeam,
  accessMode,
}: {
  teamId: string;
  isAdmin: boolean;
  isManagedTeam: boolean;
  accessMode?: CaptainAccessMode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const isCaptainOnlyPreview = !isManagedTeam && accessMode === "captain-preview";
  const canShowAdminControls = isAdmin || isCaptainOnlyPreview;
  const canPreviewCaptainDashboard = isAdmin && !isManagedTeam;
  const isCaptainDashboardPreview = Boolean(
    isCaptainOnlyPreview || (!isManagedTeam && isAdmin && searchParams.get(CAPTAIN_PREVIEW_PARAM) === "1"),
  );
  const previewHref = `/admin/teams/${teamId}/captain-preview`;
  const fullAdminHref = isCaptainOnlyPreview
    ? getExitCaptainPreviewHref({ pathname, searchParamsKey, teamId })
    : getFullAdminHref({ pathname, teamId });

  useEffect(() => {
    if (isManagedTeam) return;

    const root = document.querySelector(".captain-team-shell") ?? document.body;
    const frame = window.requestAnimationFrame(rewriteCaptainFacingText);
    const observer = new MutationObserver(rewriteCaptainFacingText);

    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isManagedTeam, pathname, searchParamsKey]);

  useEffect(() => {
    if (!isCaptainDashboardPreview || isManagedTeam) return;

    const selector = `.captain-team-shell a[href^="/captain/team/${teamId}"]:not([data-captain-preview-ignore="true"])`;

    function updateLinks() {
      for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))) {
        const href = link.getAttribute("href");
        if (!href) continue;

        link.setAttribute(
          "href",
          applyCaptainPreviewToHref({ href, teamId }),
        );
      }
    }

    updateLinks();

    const root = document.querySelector(".captain-team-shell") ?? document.body;
    const observer = new MutationObserver(updateLinks);
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isCaptainDashboardPreview, isManagedTeam, searchParamsKey, teamId]);

  const overline = isManagedTeam
    ? "SIXFL full admin managed squad"
    : isCaptainDashboardPreview
      ? "Admin captain dashboard preview"
      : isAdmin
        ? "SIXFL admin team view"
        : "SIXFL captain dashboard";

  const description = isManagedTeam
    ? "Full admin view: this managed squad is controlled by SIXFL. Captain preview is not used for managed squads."
    : isCaptainDashboardPreview
      ? "You are viewing the captain dashboard as a captain would see it. Admin-only squad tools are hidden on this page."
      : isAdmin
        ? "Full admin view: fixtures, results and payment tools are visible."
        : "Your dashboard for matchday control, fixtures, results, payments and squad details.";

  return (
    <>
      {canShowAdminControls && !isManagedTeam ? (
        <style>{`
          .captain-team-shell a[href="/captain/team/${teamId}/prospects"],
          .captain-team-shell a[href="/captain/team/${teamId}/prospects?${CAPTAIN_PREVIEW_PARAM}=1"] {
            display: none !important;
          }
        `}</style>
      ) : null}

      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
        {overline}
      </p>

      <p className="mt-3 max-w-2xl text-sm text-white/65 sm:text-base">
        {description}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {canShowAdminControls ? (
          <Link
            href={`/admin/teams/${teamId}`}
            data-captain-preview-ignore="true"
            className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
          >
            Back to admin team
          </Link>
        ) : null}

        {canPreviewCaptainDashboard && !isCaptainDashboardPreview ? (
          <a
            href={previewHref}
            data-captain-preview-ignore="true"
            className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Preview captain dashboard
          </a>
        ) : null}

        {canShowAdminControls && isCaptainDashboardPreview ? (
          <a
            href={fullAdminHref}
            data-captain-preview-ignore="true"
            className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Return to full admin view
          </a>
        ) : null}
      </div>
    </>
  );
}
