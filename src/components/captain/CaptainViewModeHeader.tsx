// ========================================
// File: src/components/captain/CaptainViewModeHeader.tsx
// ========================================

"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
  { from: "Standard team fee", to: "Team match fee" },
  { from: "standard team fee", to: "team match fee" },
  { from: "Standard team", to: "Team-managed squad" },
] as const;

type CaptainAccessMode = "admin-preview" | "captain-preview" | "captain";

type PendingPlayerPoolApproval = {
  requestId: string;
  status: string;
  publicCode: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  requestedAt: string;
  introducedAt: string | null;
};

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

function getFullAdminDestination(input: {
  pathname: string | null;
  searchParamsKey: string;
  teamId: string;
}) {
  const fallback = `/captain/team/${input.teamId}/squad`;
  const captainSquadPath = `/captain/team/${input.teamId}/captain-squad`;
  const adminSquadPath = `/captain/team/${input.teamId}/squad`;
  const currentPathname = input.pathname || fallback;
  const pathname =
    currentPathname === captainSquadPath || currentPathname === `${captainSquadPath}/`
      ? adminSquadPath
      : currentPathname;
  const searchParams = new URLSearchParams(input.searchParamsKey);
  searchParams.delete("captainPreview");
  const query = searchParams.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

function getPreviewExitHref(input: { teamId: string; to: string }) {
  return `/admin/teams/${input.teamId}/captain-preview/exit?to=${encodeURIComponent(input.to)}`;
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
    if (node.textContent?.trim()) textNodes.push(node as Text);
  }

  for (const node of textNodes) {
    let nextText = node.textContent ?? "";
    for (const replacement of CAPTAIN_FACING_REPLACEMENTS) {
      nextText = nextText.split(replacement.from).join(replacement.to);
    }
    if (nextText !== node.textContent) node.textContent = nextText;
  }
}

function getPlayerDisplayName(player: PendingPlayerPoolApproval) {
  return (
    [player.firstName, player.lastName].filter(Boolean).join(" ").trim() ||
    player.email ||
    "PlayerPool player"
  );
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
  const isCaptainDashboardPreview = Boolean(hasTeamId && isCaptainOnlyPreview);
  const previewHref = `/admin/teams/${teamId}/captain-preview`;
  const fullAdminDestination = getFullAdminDestination({ pathname, searchParamsKey, teamId });
  const fullAdminHref = getPreviewExitHref({ teamId, to: fullAdminDestination });
  const adminHomeHref = isCaptainDashboardPreview ? getPreviewExitHref({ teamId, to: "/admin" }) : "/admin";
  const adminTeamHref = isCaptainDashboardPreview
    ? getPreviewExitHref({ teamId, to: `/admin/teams/${teamId}` })
    : `/admin/teams/${teamId}`;
  const displaySeason = season?.trim() || null;
  const shouldRewriteCaptainFacingText = !isManagedTeam && (!isAdmin || isCaptainDashboardPreview);
  const isOverview = Boolean(
    hasTeamId &&
      (pathname === `/captain/team/${teamId}` || pathname === `/captain/team/${teamId}/`),
  );
  const [pendingPlayerPoolApprovals, setPendingPlayerPoolApprovals] = useState<
    PendingPlayerPoolApproval[]
  >([]);

  useEffect(() => {
    if (!shouldRewriteCaptainFacingText) return;

    let cancelled = false;
    const timers: number[] = [];
    const delays = [0, 100, 300, 700, 1400];

    for (const delay of delays) {
      const timer = window.setTimeout(() => {
        if (!cancelled) rewriteCaptainFacingText();
      }, delay);
      timers.push(timer);
    }

    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [pathname, searchParamsKey, shouldRewriteCaptainFacingText]);

  useEffect(() => {
    if (!isOverview || !teamId) {
      setPendingPlayerPoolApprovals([]);
      return;
    }

    const controller = new AbortController();

    fetch(`/api/captain/team/${teamId}/player-pool/pending-approvals`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { items: [] as PendingPlayerPoolApproval[] };
        return (await response.json()) as { items?: PendingPlayerPoolApproval[] };
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setPendingPlayerPoolApprovals(Array.isArray(payload.items) ? payload.items : []);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) setPendingPlayerPoolApprovals([]);
      });

    return () => controller.abort();
  }, [isOverview, teamId]);

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

  if (teamName) {
    return (
      <div className="min-w-0 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">Current view</p>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-50">{currentViewLabel}</span>
        </div>
        <h1 className="captain-team-heading mt-3 text-2xl font-semibold tracking-tight text-white sm:text-4xl">{teamName}</h1>
        {leagueName ? (
          <p className="captain-team-meta mt-3 text-sm leading-6 text-white/55">
            {leagueName}{displaySeason ? ` · ${displaySeason}` : ""}{isLive ? " · Current live season" : ""}
          </p>
        ) : null}
        {!hasTeamId ? <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">{currentViewDescription}</p> : null}
        {canShowAdminControls ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={adminHomeHref} className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white">Admin home</a>
            <a href={adminTeamHref} className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white">Admin team page</a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-emerald-400/20 bg-black/20 p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Current view</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-50">{currentViewLabel}</span>
            {isManagedTeam ? <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-100">Captain preview unavailable</span> : null}
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">{currentViewDescription}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {canShowAdminControls ? <a href={adminHomeHref} className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white">Admin home</a> : null}
          {canShowAdminControls ? <a href={adminTeamHref} className="inline-flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white">Admin team page</a> : null}
          {canPreviewCaptainDashboard && !isCaptainDashboardPreview ? <a href={previewHref} className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20">Switch to Captain Preview</a> : null}
          {canShowAdminControls && isCaptainDashboardPreview ? <a href={fullAdminHref} className="inline-flex items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/20">Switch back to Full Admin View</a> : null}
        </div>
      </div>

      {isOverview && pendingPlayerPoolApprovals.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100/70">
                PlayerPool · action needed
              </p>
              <h2 className="mt-2 text-lg font-black text-white">
                {pendingPlayerPoolApprovals.length} PlayerPool request{pendingPlayerPoolApprovals.length === 1 ? " needs" : "s need"} attention
              </h2>
              <p className="mt-1 text-sm text-sky-50/70">
                Approved players are ready for the team handoff. Any request still waiting for SIXFL approval is shown here too, so nobody disappears from view.
              </p>
            </div>
            <a
              href={`/captain/team/${teamId}/player-pool`}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-sky-200"
            >
              Open PlayerPool
            </a>
          </div>

          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {pendingPlayerPoolApprovals.map((player) => {
              const introduced = player.status === "INTRODUCED";
              return (
                <div key={player.requestId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-sky-200">{player.publicCode}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        introduced
                          ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
                          : "border-sky-300/25 bg-sky-400/10 text-sky-100"
                      }`}
                    >
                      {introduced ? "Approved · waiting to join" : "Waiting for SIXFL approval"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{getPlayerDisplayName(player)}</div>
                  <div className="mt-1 text-xs text-white/50">
                    {player.email || "No email saved"}{player.phone ? ` · ${player.phone}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
