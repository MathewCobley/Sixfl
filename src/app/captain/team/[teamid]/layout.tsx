// ========================================
// File: src/app/captain/team/[teamid]/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import AdminPlayerPreviewLinks from "@/components/captain/AdminPlayerPreviewLinks";
import CaptainAdminFeeRouteNotice from "@/components/captain/CaptainAdminFeeRouteNotice";
import CaptainFixtureBadgesBridge from "@/components/captain/CaptainFixtureBadgesBridge";
import CaptainMatchdayAvailabilityBadgesBridge from "@/components/captain/CaptainMatchdayAvailabilityBadgesBridge";
import CaptainOnboardingReminderBridge from "@/components/captain/CaptainOnboardingReminderBridge";
import CaptainRedirectErrorNoticeFix from "@/components/captain/CaptainRedirectErrorNoticeFix";
import CaptainSupportPanel from "@/components/captain/CaptainSupportPanel";
import CaptainViewModeHeader from "@/components/captain/CaptainViewModeHeader";
import ManagedSquadEditLinks from "@/components/captain/ManagedSquadEditLinks";
import PendingActivationDeleteLinks from "@/components/captain/PendingActivationDeleteLinks";
import PendingActivationReturnLinks from "@/components/captain/PendingActivationReturnLinks";
import ProspectsReadableLayout from "@/components/captain/ProspectsReadableLayout";
import QueuedSmsReasonHints from "@/components/admin/messages/QueuedSmsReasonHints";
import ManagedSquadInjuryBridge from "@/components/admin/teams/ManagedSquadInjuryBridge";
import { getCaptainUnreadMessageCount } from "@/lib/messaging/captain-inbox";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";

const captainMobileStyles = String.raw`
.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) {
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  align-items: center;
}

.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > form {
  min-width: 0;
}

.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > form:first-child {
  flex: 1 1 18rem;
  display: flex;
  flex-wrap: wrap;
}

.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > form:first-child > div {
  flex: 1 1 13rem;
  min-width: min(13rem, 100%);
}

.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > a,
.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > button,
.captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > form:not(:first-child) {
  flex: 0 0 auto;
}

@media (min-width: 1280px) {
  .captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) {
    flex: 0 1 39rem;
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .captain-team-shell .captain-team-container {
    gap: 1rem;
    padding: 0.75rem;
    padding-bottom: 2rem;
  }

  .captain-team-shell .captain-team-header {
    border-radius: 1.5rem;
  }

  .captain-team-shell .captain-team-header-top {
    padding: 1rem;
  }

  .captain-team-shell .captain-team-logo {
    height: 4.5rem;
    width: 4.5rem;
    border-radius: 1.25rem;
  }

  .captain-team-shell .captain-team-heading {
    font-size: 1.65rem;
    line-height: 1.08;
    overflow-wrap: anywhere;
  }

  .captain-team-shell .captain-team-meta {
    line-height: 1.55;
  }

  .captain-team-shell .captain-team-nav {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    overflow: visible;
    padding: 0.75rem 1rem 1rem;
  }

  .captain-team-shell .captain-team-nav-group {
    min-width: 0;
  }

  .captain-team-shell .captain-team-nav-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .captain-team-shell .captain-team-nav a {
    min-height: 2.5rem;
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .captain-team-shell .captain-team-main {
    min-width: 0;
  }

  .captain-team-shell .captain-team-main section,
  .captain-team-shell .captain-team-main article {
    border-radius: 1.35rem;
  }

  .captain-team-shell .captain-team-main section > div[class*="px-6"],
  .captain-team-shell .captain-team-main section > div[class*="sm:px-6"],
  .captain-team-shell .captain-team-main div[class*="px-6"] {
    padding-left: 1rem !important;
    padding-right: 1rem !important;
  }

  .captain-team-shell .captain-team-main section > div[class*="py-6"],
  .captain-team-shell .captain-team-main div[class*="py-6"] {
    padding-top: 1.15rem !important;
    padding-bottom: 1.15rem !important;
  }

  .captain-team-shell .captain-team-main section[class*="p-6"],
  .captain-team-shell .captain-team-main section[class*="p-5"],
  .captain-team-shell .captain-team-main div[class*="p-6"],
  .captain-team-shell .captain-team-main div[class*="p-5"] {
    padding: 1rem !important;
  }

  .captain-team-shell .captain-team-main h1[class*="text-3xl"],
  .captain-team-shell .captain-team-main h2[class*="text-3xl"],
  .captain-team-shell .captain-team-main h2[class*="text-2xl"] {
    font-size: 1.65rem !important;
    line-height: 1.15 !important;
  }

  .captain-team-shell .captain-team-main h3[class*="text-2xl"] {
    font-size: 1.2rem !important;
    line-height: 1.25 !important;
  }

  .captain-team-shell .captain-team-main a[class*="rounded-full"],
  .captain-team-shell .captain-team-main button[class*="rounded-full"],
  .captain-team-shell .captain-team-main a[class*="rounded-xl"],
  .captain-team-shell .captain-team-main button[class*="rounded-xl"],
  .captain-team-shell .captain-team-main button[class*="rounded-2xl"] {
    min-height: 2.75rem;
    justify-content: center;
  }

  .captain-team-shell .captain-team-main form button[type="submit"] {
    width: 100%;
  }

  .captain-team-shell .captain-team-main input,
  .captain-team-shell .captain-team-main textarea,
  .captain-team-shell .captain-team-main select {
    max-width: 100%;
  }

  .captain-team-shell .captain-team-main input[class*="max-w-[180px]"] {
    max-width: 100% !important;
  }

  .captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) {
    flex-direction: column;
    align-items: stretch;
  }

  .captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > form,
  .captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > a,
  .captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > button {
    width: 100%;
  }

  .captain-team-shell .captain-team-main div:has(> form input[name="membershipId"]) > form:first-child > div {
    width: 100%;
    min-width: 0;
  }

  .captain-team-shell .captain-team-main [class*="grid-cols-[1fr_82px_82px]"] {
    grid-template-columns: minmax(0, 1fr) minmax(3.75rem, 4.75rem) minmax(3.75rem, 4.75rem) !important;
    gap: 0.5rem !important;
  }

  .captain-team-shell .captain-team-main [class*="grid-cols-[1fr_82px_82px]"] input {
    width: 100%;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
}
`;

type CaptainNavItem = {
  href: string;
  label: string;
  logoSrc?: string;
  unreadCount?: number;
};

type CaptainNavGroup = {
  label: string;
  items: CaptainNavItem[];
};

function getTeamInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "S";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "S";
}

export default async function CaptainTeamLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);

  const team = await prisma.team.findUnique({
    where: { id: teamid },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      teamMode: true,
      league: {
        select: {
          id: true,
          name: true,
          slug: true,
          season: true,
          isActive: true,
          competition: {
            select: {
              id: true,
              name: true,
              currentLeague: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  season: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const unreadMessageCount = await getCaptainUnreadMessageCount(teamid);

  const displayCompetition = team.league?.competition ?? null;
  const displayLeague = displayCompetition?.currentLeague ?? team.league;
  const displayLeagueName = displayCompetition?.name ?? displayLeague?.name ?? "No competition assigned";
  const displayLeagueSlug = displayLeague?.slug ?? null;
  const displaySeason = displayLeague?.season ?? null;
  const displayIsLive = displayLeague?.isActive ?? false;

  const captainTeamMemberships = access.user?.id
    ? await prisma.teamMember.findMany({
        where: {
          userId: access.user.id,
          role: TeamRole.CAPTAIN,
        },
        select: {
          team: {
            select: {
              id: true,
              name: true,
              league: {
                select: {
                  name: true,
                  season: true,
                  competition: {
                    select: {
                      name: true,
                      currentLeague: {
                        select: {
                          season: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];

  const captainTeamOptions = captainTeamMemberships
    .map((membership) => membership.team)
    .sort((a, b) => a.name.localeCompare(b.name));
  const showCaptainTeamSwitcher = !access.isAdmin && captainTeamOptions.length > 1;

  const isManagedTeam = team.teamMode === "MANAGED";
  const showTeamPayments = !isManagedTeam || access.isAdmin;

  const squadHref = access.isAdmin
    ? `/captain/team/${teamid}/squad`
    : `/captain/team/${teamid}/captain-squad`;

  const navGroups: CaptainNavGroup[] = [
    {
      label: "Team & players",
      items: [
        { href: `/captain/team/${teamid}`, label: "Overview" },
        { href: squadHref, label: "Squad" },
        ...(access.isAdmin
          ? [{ href: `/captain/team/${teamid}/prospects`, label: "Prospects" }]
          : []),
        { href: `/captain/team/${teamid}/player-pool`, label: "PlayerPool" },
        { href: `/captain/team/${teamid}/kit`, label: "Team kit" },
        {
          href: `/captain/team/${teamid}/messages`,
          label: "Messages",
          unreadCount: unreadMessageCount,
        },
        { href: `/captain/team/${teamid}/whatsapp`, label: "WhatsApp" },
      ],
    },
    {
      label: "Matchday",
      items: [
        { href: `/captain/team/${teamid}/fixtures`, label: "Fixtures" },
        { href: `/captain/team/${teamid}/match-fees`, label: "Matchday squad" },
        { href: `/captain/team/${teamid}/availability`, label: "Availability" },
        {
          href: `/captain/team/${teamid}/weeks-unavailable`,
          label: "Weeks unavailable",
        },
        { href: `/captain/team/${teamid}/results`, label: "Match reports" },
      ],
    },
    {
      label: "League & media",
      items: [
        {
          href: `/captain/team/${teamid}#captain-league-table`,
          label: "Table",
        },
        { href: `/captain/team/${teamid}/results-history`, label: "Team results" },
        ...(displayLeagueSlug
          ? [{ href: `/leagues/${displayLeagueSlug}/results`, label: "League results" }]
          : []),
        { href: `/captain/team/${teamid}/player-stats`, label: "Player stats" },
        {
          href: `/captain/team/${teamid}/tv`,
          label: "SIXFL TV",
          logoSrc: "/Sixfl-tv.png",
        },
        {
          href: `/goal-of-the-week?from=captain&teamId=${encodeURIComponent(teamid)}`,
          label: "Goal of the Week",
        },
      ],
    },
    {
      label: "Payments",
      items: [
        {
          href: `/captain/team/${teamid}/player-payments`,
          label: "Squad payments",
        },
        ...(showTeamPayments
          ? [{ href: `/captain/team/${teamid}/payments`, label: "Team payments" }]
          : []),
      ],
    },
  ];

  return (
    <div className="captain-team-shell min-h-screen bg-[#07130f] text-white">
      <style>{captainMobileStyles}</style>
      <CaptainRedirectErrorNoticeFix />
      <QueuedSmsReasonHints />
      <ProspectsReadableLayout />
      <CaptainFixtureBadgesBridge />
      <CaptainMatchdayAvailabilityBadgesBridge />
      <CaptainOnboardingReminderBridge />
      {access.isAdmin ? <ManagedSquadInjuryBridge /> : null}
      {access.isAdmin ? <ManagedSquadEditLinks /> : null}
      {access.isAdmin ? <PendingActivationDeleteLinks /> : null}
      {access.isAdmin ? <PendingActivationReturnLinks /> : null}
      {access.isAdmin ? <AdminPlayerPreviewLinks /> : null}

      <div className="captain-team-container mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-3 py-4 sm:gap-8 sm:px-10 sm:py-6">
        <header className="captain-team-header overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:rounded-3xl">
          <div className="captain-team-header-top border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-5">
              <CaptainViewModeHeader
                teamId={team.id}
                isAdmin={access.isAdmin}
                isManagedTeam={isManagedTeam}
                accessMode={access.accessMode}
              />
              <div className="mt-3 flex justify-end">
                <Link
                  href={`/player/team/${team.id}`}
                  className="inline-flex items-center rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/15"
                >
                  {access.isAdmin ? "View player page" : "View my player page"}
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                <div className="captain-team-logo flex h-18 w-18 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/30 shadow-[0_14px_40px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24 sm:rounded-3xl">
                  {team.logoUrl ? (
                    <img
                      src={team.logoUrl}
                      alt={`${team.name} badge`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-black tracking-tight text-emerald-100 sm:text-3xl">
                      {getTeamInitials(team.name)}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h1 className="captain-team-heading mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                    {team.name}
                  </h1>

                  <p className="captain-team-meta mt-3 text-sm text-white/55">
                    {displayLeagueName}
                    {displaySeason ? ` · ${displaySeason}` : ""}
                    {displayIsLive ? " · Current live season" : ""}
                  </p>
                </div>
              </div>

              {showCaptainTeamSwitcher ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                    Switch team
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {captainTeamOptions.map((option) => (
                      <Link
                        key={option.id}
                        href={`/captain/team/${option.id}`}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          option.id === teamid
                            ? "bg-emerald-400 text-black"
                            : "bg-white/[0.05] text-white/70 hover:bg-white/[0.08] hover:text-white"
                        }`}
                      >
                        {option.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <nav
            className="captain-team-nav grid gap-3 px-4 py-4 sm:px-6 lg:grid-cols-2 xl:grid-cols-4"
            aria-label="Team dashboard"
          >
            {navGroups.map((group) => (
              <div
                key={group.label}
                className="captain-team-nav-group min-w-0 rounded-2xl border border-white/10 bg-black/20 p-3"
                role="group"
                aria-label={group.label}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/65">
                  {group.label}
                </div>
                <div className="captain-team-nav-items mt-2 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-label={
                        item.unreadCount && item.unreadCount > 0
                          ? `${item.label}, ${item.unreadCount} unread`
                          : item.label
                      }
                      title={item.logoSrc ? item.label : undefined}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white/70 transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100"
                    >
                      {item.logoSrc ? (
                        <img
                          src={item.logoSrc}
                          alt={item.label}
                          className="h-5 w-auto max-w-[5rem] object-contain"
                        />
                      ) : (
                        <>
                          <span>{item.label}</span>
                          {item.unreadCount && item.unreadCount > 0 ? (
                            <span
                              aria-hidden="true"
                              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1.5 text-[11px] font-bold leading-none text-black"
                            >
                              {item.unreadCount}
                            </span>
                          ) : null}
                        </>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </header>

        <main className="captain-team-main min-w-0 space-y-8">
          <CaptainSupportPanel teamId={team.id} />
          {children}
          <CaptainAdminFeeRouteNotice teamId={team.id} />
        </main>
      </div>
    </div>
  );
}
