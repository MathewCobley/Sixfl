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

type CaptainViewModeHeaderProps = {
  teamId?: string;
  isAdmin?: boolean;
  isManagedTeam?: boolean;
  accessMode?: CaptainAccessMode;
  teamName?: string;
  leagueName?: string;
  season?: string | null;
  isLive?: boolean;
};

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
  teamId = "",
  isAdmin = false,
  isManagedTeam = false,
  accessMode,
  teamName,
  leagueName,
  season,
  isLive = false,
}: CaptainViewModeHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const hasTeamId = Boolean(teamId);
  const isCaptainOnlyPreview = !isManagedTeam && accessMode === "captain-preview";
  const canShowAdminControls = hasTeamId && (isAdmin || isCaptainOnlyPreview);
  const canPreviewCaptainDashboard = hasTeamId && isAdmin && !isManagedTeam;
  const isCaptainDashboardPreview = Boolean(
    hasTeamId && (isCaptainOnlyPreview || (!isManagedTeam && isAdmin && searchParams.get(CAPTAIN_PREVIEW_PARAM) === "1")),
  );
  const previewHref = `/admin/teams/${teamId}/captain-preview`;
  const fullAdminHref = isCaptainOnlyPreview
    ? getExitCaptainPreviewHref({ pathname, searchParamsKey, teamId })
    : getFullAdminHref({ pathname, teamId });
  const displaySeason = season?.trim() || null;

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
    if (!isCaptainDashboardPreview || isManagedTeam || !hasTeamId) return;

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
  }, [hasTeamId, isCaptainDashboardPreview, isManagedTeam, searchParamsKey, teamId]);

  const currentViewLabel = isManagedTeam
    ? "Full Admin View — Managed Squad"
    : isCaptainDashboardPreview
      ? "Captain Preview"
      : isAdmin
        ? "Full Admin View"
        : "Captain View";

  const currentViewDescription = isManagedTeam
    ? "This team is managed by SIXFL. Captain preview is disabled and all controls are admin-only."
    : isCaptainDashboardPreview
      ? "You are seeing what the team captain sees. Admin-only controls should be hidden."
      : isAdmin
        ? "You are using the full SIXFL admin view. Fixtures, results, squad and payment tools are available."
        : "You are using the captain dashboard for this team.";

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

      <div className="rounded-3xl border border-emerald-400/20 bg-black/20 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
              Current view
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-50">
                {currentViewLabel}
              </span>
              {isManagedTeam ? (
                <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">
                  Captain preview unavailable
                </span>
              ) : null}
            </div>

            {teamName ? (
              <h1 className="captain-team-heading mt-3 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                {teamName}
              </h1>
            ) : null}

            {teamName && leagueName ? (
              <p className="captain-team-meta mt-3 text-sm text-white/55">
                {leagueName}
                {displaySeason ? ` · ${displaySeason}` : ""}
                {isLive ? " · Current live season" : ""}
              </p>
            ) : null}

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">
              {currentViewDescription}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {canShowAdminControls ? (
              <Link
                href="/admin"
                data-captain-preview-ignore="true"
                className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
              >
                Admin home
              </Link>
            ) : null}

            {canShowAdminControls ? (
              <Link
                href={`/admin/teams/${teamId}`}
                data-captain-preview-ignore="true"
                className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
              >
                Admin team page
              </Link>
            ) : null}

            {canPreviewCaptainDashboard && !isCaptainDashboardPreview ? (
              <a
                href={previewHref}
                data-captain-preview-ignore="true"
                className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Switch to Captain Preview
              </a>
            ) : null}

            {canShowAdminControls && isCaptainDashboardPreview ? (
              <a
                href={fullAdminHref}
                data-captain-preview-ignore="true"
                className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20"
              >
                Switch back to Full Admin View
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
