import CupInvitationNotice from "@/components/cups/CupInvitationNotice";
// ========================================
// File: src/app/captain/team/[teamid]/layout.tsx
// ========================================

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TeamRole } from "@prisma/client";

import MandatoryAgreementGate from "@/components/agreements/MandatoryAgreementGate";
import AdminPlayerPreviewLinks from "@/components/captain/AdminPlayerPreviewLinks";
import CaptainAdminFeeRouteNotice from "@/components/captain/CaptainAdminFeeRouteNotice";
import CaptainAppHeader from "@/components/captain/CaptainAppHeader";
import CaptainFixtureBadgesBridge from "@/components/captain/CaptainFixtureBadgesBridge";
import CaptainMatchdayAvailabilityBadgesBridge from "@/components/captain/CaptainMatchdayAvailabilityBadgesBridge";
import CaptainOnboardingReminderBridge from "@/components/captain/CaptainOnboardingReminderBridge";
import CaptainPwaBottomNav from "@/components/captain/CaptainPwaBottomNav";
import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";
import CaptainRedirectErrorNoticeFix from "@/components/captain/CaptainRedirectErrorNoticeFix";
import CaptainSupportPanel from "@/components/captain/CaptainSupportPanel";
import CaptainViewModeHeader from "@/components/captain/CaptainViewModeHeader";
import ManagedSquadEditLinks from "@/components/captain/ManagedSquadEditLinks";
import SixflTvPriorityScoreBadge from "@/components/sixfl-tv/SixflTvPriorityScoreBadge";
import PendingActivationDeleteLinks from "@/components/captain/PendingActivationDeleteLinks";
import PendingActivationReturnLinks from "@/components/captain/PendingActivationReturnLinks";
import ProspectsReadableLayout from "@/components/captain/ProspectsReadableLayout";
import ManagedSquadInjuryBridge from "@/components/admin/teams/ManagedSquadInjuryBridge";
import { hasAcceptedCurrentAgreement } from "@/lib/agreements";
import { getCaptainUnreadMessageCount } from "@/lib/messaging/captain-inbox";
import { prisma } from "@/lib/prisma";
import { requireCaptain } from "@/lib/requireCaptain";
import { getSixflTvPriorityScore } from "@/lib/sixfl-tv/priority-score";

export const metadata: Metadata = {
  icons: {
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "SIXFL",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07130f",
};

const captainMobileStyles = String.raw`

body:has(.captain-app-header) .captain-team-container {
  max-width: 40rem !important;
  gap: 0.6rem !important;
  padding: 0.4rem 0.65rem calc(5.75rem + env(safe-area-inset-bottom)) !important;
}

body:has(.captain-app-header) .captain-team-main {
  min-width: 0;
}

body:has(.captain-app-header) .captain-team-main > * {
  min-width: 0;
}

body:has(.captain-app-header) .captain-team-main [class*="space-y-8"] > :not([hidden]) ~ :not([hidden]),
body:has(.captain-app-header) .captain-team-main [class*="space-y-6"] > :not([hidden]) ~ :not([hidden]),
body:has(.captain-app-header) .captain-team-main [class*="space-y-5"] > :not([hidden]) ~ :not([hidden]) {
  margin-top: 0.75rem !important;
}

body:has(.captain-app-header) .captain-team-main section,
body:has(.captain-app-header) .captain-team-main article,
body:has(.captain-app-header) .captain-team-main details {
  border-radius: 1.15rem !important;
  box-shadow: none !important;
}

body:has(.captain-app-header) .captain-team-main section[class*="p-8"],
body:has(.captain-app-header) .captain-team-main section[class*="p-6"],
body:has(.captain-app-header) .captain-team-main section[class*="p-5"],
body:has(.captain-app-header) .captain-team-main article[class*="p-8"],
body:has(.captain-app-header) .captain-team-main article[class*="p-6"],
body:has(.captain-app-header) .captain-team-main article[class*="p-5"],
body:has(.captain-app-header) .captain-team-main div[class*="p-8"],
body:has(.captain-app-header) .captain-team-main div[class*="p-6"],
body:has(.captain-app-header) .captain-team-main div[class*="p-5"] {
  padding: 0.9rem !important;
}

body:has(.captain-app-header) .captain-team-main [class*="px-8"],
body:has(.captain-app-header) .captain-team-main [class*="px-6"],
body:has(.captain-app-header) .captain-team-main [class*="px-5"] {
  padding-left: 0.9rem !important;
  padding-right: 0.9rem !important;
}

body:has(.captain-app-header) .captain-team-main [class*="py-8"],
body:has(.captain-app-header) .captain-team-main [class*="py-6"],
body:has(.captain-app-header) .captain-team-main [class*="py-5"] {
  padding-top: 0.9rem !important;
  padding-bottom: 0.9rem !important;
}

body:has(.captain-app-header) .captain-team-main h1[class*="text-4xl"],
body:has(.captain-app-header) .captain-team-main h1[class*="text-3xl"],
body:has(.captain-app-header) .captain-team-main h2[class*="text-4xl"],
body:has(.captain-app-header) .captain-team-main h2[class*="text-3xl"] {
  font-size: 1.35rem !important;
  line-height: 1.2 !important;
  letter-spacing: -0.015em !important;
}

body:has(.captain-app-header) .captain-team-main h2[class*="text-2xl"],
body:has(.captain-app-header) .captain-team-main h3[class*="text-2xl"] {
  font-size: 1.1rem !important;
  line-height: 1.25 !important;
}

body:has(.captain-app-header) .captain-team-main p[class*="uppercase"]:has(+ h1),
body:has(.captain-app-header) .captain-team-main p[class*="uppercase"]:has(+ h2),
body:has(.captain-app-header) .captain-team-main div[class*="uppercase"]:has(+ h1),
body:has(.captain-app-header) .captain-team-main div[class*="uppercase"]:has(+ h2) {
  display: none !important;
}

body:has(.captain-app-header) .captain-team-main a[class*="rounded-full"],
body:has(.captain-app-header) .captain-team-main button[class*="rounded-full"] {
  border-radius: 0.85rem !important;
}

body:has(.captain-app-header) .captain-team-main a,
body:has(.captain-app-header) .captain-team-main button,
body:has(.captain-app-header) .captain-team-main input,
body:has(.captain-app-header) .captain-team-main textarea {
  font-size: 0.875rem;
}

body:has(.captain-app-header) .captain-team-main img[src*="player%20pool"],
body:has(.captain-app-header) .captain-team-main img[src*="player pool"] {
  max-height: 3.5rem !important;
  width: auto !important;
}

body:has(.captain-app-header) .captain-app-web-only,
body:has(.captain-app-header) .captain-app-secondary {
  display: none !important;
}

body:has(.captain-app-header) .captain-team-main table {
  font-size: 0.75rem;
}

body:has(.captain-app-header) .captain-team-main [class*="lg:grid-cols-"],
body:has(.captain-app-header) .captain-team-main [class*="xl:grid-cols-"] {
  grid-template-columns: minmax(0, 1fr) !important;
}
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


/* Installed captain app: treat route content as mobile screens, not a squeezed website. */
body:has(.captain-app-header) .captain-team-main {
  font-size: 0.875rem;
}

body:has(.captain-app-header) .captain-team-main > [class*="space-y-"] {
  margin: 0 !important;
}

body:has(.captain-app-header) .captain-team-main [class*="shadow-["] {
  box-shadow: none !important;
}

body:has(.captain-app-header) .captain-team-main section[class*="radial-gradient"],
body:has(.captain-app-header) .captain-team-main article[class*="radial-gradient"] {
  background: rgba(255,255,255,0.025) !important;
  border-color: rgba(255,255,255,0.075) !important;
}

body:has(.captain-app-header) .captain-team-main section[class*="radial-gradient"] > div,
body:has(.captain-app-header) .captain-team-main article[class*="radial-gradient"] > div {
  padding: 0.85rem !important;
}

body:has(.captain-app-header) .captain-team-main section[class*="radial-gradient"] h1,
body:has(.captain-app-header) .captain-team-main section[class*="radial-gradient"] h2,
body:has(.captain-app-header) .captain-team-main article[class*="radial-gradient"] h1,
body:has(.captain-app-header) .captain-team-main article[class*="radial-gradient"] h2 {
  margin-top: 0.2rem !important;
  font-size: 1.1rem !important;
  line-height: 1.25 !important;
}

body:has(.captain-app-header) .captain-team-main section[class*="radial-gradient"] p[class*="max-w-"],
body:has(.captain-app-header) .captain-team-main article[class*="radial-gradient"] p[class*="max-w-"] {
  margin-top: 0.4rem !important;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  font-size: 0.75rem !important;
  line-height: 1.25rem !important;
  color: rgba(255,255,255,0.52) !important;
}

body:has(.captain-app-header) .captain-team-main [class*="rounded-3xl"] {
  border-radius: 1.05rem !important;
}

body:has(.captain-app-header) .captain-team-main [class*="sticky"][class*="top-"] {
  position: static !important;
}

body:has(.captain-app-header) .captain-team-main nav[aria-label*="filter" i],
body:has(.captain-app-header) .captain-team-main nav[aria-label*="message" i] {
  flex-wrap: nowrap !important;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

body:has(.captain-app-header) .captain-team-main nav[aria-label*="filter" i]::-webkit-scrollbar,
body:has(.captain-app-header) .captain-team-main nav[aria-label*="message" i]::-webkit-scrollbar {
  display: none;
}

body:has(.captain-app-header) .captain-team-main nav[aria-label*="filter" i] a,
body:has(.captain-app-header) .captain-team-main nav[aria-label*="message" i] a {
  flex: 0 0 auto;
  white-space: nowrap;
}

body:has(.captain-app-header) .captain-team-main details > summary {
  min-height: 2.75rem;
  display: flex;
  align-items: center;
}

body:has(.captain-app-header) .captain-team-main [class*="xl:grid-cols-"],
body:has(.captain-app-header) .captain-team-main [class*="lg:grid-cols-"] {
  grid-template-columns: minmax(0,1fr) !important;
}

body:has(.captain-app-header) .captain-team-main [class*="mt-6"] {
  margin-top: 0.85rem !important;
}

body:has(.captain-app-header) .captain-team-main [class*="mt-5"] {
  margin-top: 0.7rem !important;
}

body:has(.captain-app-header) .captain-team-main [class*="gap-8"],
body:has(.captain-app-header) .captain-team-main [class*="gap-6"] {
  gap: 0.75rem !important;
}

body:has(.captain-app-header) .captain-team-main [class*="min-h-11"],
body:has(.captain-app-header) .captain-team-main [class*="min-h-12"] {
  min-height: 2.65rem !important;
}

body:has(.captain-app-header) .captain-team-main table {
  white-space: nowrap;
}

/* Fixtures is an app screen, not a desktop control panel squeezed into a phone. */
body:has(.captain-app-header) .captain-fixtures-page {
  margin: 0 !important;
}

body:has(.captain-app-header) .captain-fixtures-primary {
  overflow: visible !important;
  border-color: rgba(255,255,255,0.08) !important;
  background: rgba(255,255,255,0.025) !important;
}

body:has(.captain-app-header) .captain-fixtures-primary > div {
  gap: 0.7rem !important;
  padding: 0.8rem !important;
}

body:has(.captain-app-header) .captain-fixtures-primary h2 {
  margin-top: 0 !important;
  font-size: 1.05rem !important;
  line-height: 1.35 !important;
}

body:has(.captain-app-header) .captain-fixtures-guidance {
  margin-top: 0.6rem !important;
  padding: 0.7rem 0.8rem !important;
  font-size: 0.78rem !important;
  line-height: 1.25rem !important;
}

body:has(.captain-app-header) .captain-fixtures-guidance-detail,
body:has(.captain-app-header) .captain-fixtures-response-help {
  display: none !important;
}

body:has(.captain-app-header) .captain-fixtures-status-helper {
  margin-top: 0.55rem !important;
  font-size: 0.76rem !important;
  line-height: 1.2rem !important;
}

body:has(.captain-app-header) .captain-fixtures-response-card {
  padding: 0.75rem !important;
}

body:has(.captain-app-header) .captain-fixtures-response-card > div {
  margin-top: 0.65rem !important;
  gap: 0.5rem !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
}

body:has(.captain-app-header) .captain-fixtures-response-card button {
  min-height: 2.75rem !important;
  padding: 0.6rem 0.7rem !important;
}

body:has(.captain-app-header) .captain-fixtures-issue summary {
  min-height: 2.5rem !important;
  padding: 0.65rem 0.8rem !important;
}

body:has(.captain-app-header) .captain-fixtures-upcoming > div:first-child {
  padding: 0.75rem 0.85rem !important;
}

body:has(.captain-app-header) .captain-fixtures-upcoming > div:last-child > div {
  gap: 0.55rem !important;
  padding: 0.8rem 0.85rem !important;
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

  if (
    access.user &&
    !access.isAdmin &&
    access.accessMode === "captain" &&
    !(await hasAcceptedCurrentAgreement(access.user.id, "CAPTAIN"))
  ) {
    return (
      <MandatoryAgreementGate
        agreementType="CAPTAIN"
        name={access.user.name}
      />
    );
  }

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
  const priorityScore = await getSixflTvPriorityScore(teamid);

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
        ...(access.isAdmin
          ? [{ href: `/captain/team/${teamid}/chat`, label: "SIXFL Chat" }]
          : []),
        {
          href: `/captain/team/${teamid}/messages`,
          label: "SIXFL inbox",
          unreadCount: unreadMessageCount,
        },
        { href: `/captain/team/${teamid}/whatsapp`, label: "WhatsApp tools" },
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
          href: `/captain/team/${teamid}/table#captain-table`,
          label: "Table",
        },
        { href: `/captain/team/${teamid}/results-history`, label: "Team results" },
        { href: `/captain/team/${teamid}/cup-invitations`, label: "Cup invitations" },
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
          href: `/captain/team/${teamid}/veo-priority`,
          label: "Priority score",
        },
        {
          href: `/goal-of-the-month?from=captain&teamId=${encodeURIComponent(teamid)}`,
          label: "Goal of the Month",
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
      <ProspectsReadableLayout />
      <CaptainFixtureBadgesBridge />
      <CaptainMatchdayAvailabilityBadgesBridge />
      <CaptainOnboardingReminderBridge />
      {access.isAdmin ? <ManagedSquadInjuryBridge /> : null}
      {access.isAdmin ? <ManagedSquadEditLinks /> : null}
      {access.isAdmin ? <PendingActivationDeleteLinks /> : null}
      {access.isAdmin ? <PendingActivationReturnLinks /> : null}
      {access.isAdmin ? <AdminPlayerPreviewLinks /> : null}

      <CaptainPwaModeOnly mode="app">
        <>
          <CaptainAppHeader
            teamId={team.id}
            teamName={team.name}
            teamLogoUrl={team.logoUrl}
          />
        </>
      </CaptainPwaModeOnly>

      <div className="captain-team-container mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-3 pb-24 pt-4 sm:gap-8 sm:px-10 sm:py-6">
        <CaptainPwaModeOnly mode="web">
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                    Captain Portal
                  </p>
                  <h1 className="captain-team-heading mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                    {team.name}
                  </h1>

                  <p className="captain-team-meta mt-3 text-sm text-white/55">
                    {displayLeagueName}
                    {displaySeason ? ` · ${displaySeason}` : ""}
                    {displayIsLive ? " · Current live season" : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/captain/team/${teamid}/veo-priority`}
                      aria-label={`Open SIXFL TV Priority Score: ${priorityScore.score} out of 100`}
                      className="inline-flex rounded-full outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-fuchsia-300/70"
                    >
                      <SixflTvPriorityScoreBadge score={priorityScore} />
                    </Link>
                    <span className="text-xs text-white/45">
                      {priorityScore.qualifies
                        ? "Eligible for recorded-pitch priority"
                        : "Improve confirmations, payments and match reports to regain priority"}
                    </span>
                  </div>
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
            aria-label="Captain Portal navigation"
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
        </CaptainPwaModeOnly>

        <main className="captain-team-main min-w-0 space-y-8">
          <CaptainPwaModeOnly mode="web">
            <CaptainSupportPanel teamId={team.id} />
            {access.isCaptain && access.user ? <CupInvitationNotice teamId={team.id} userId={access.user.id} /> : null}
          </CaptainPwaModeOnly>
          {children}
          <CaptainPwaModeOnly mode="web">
            <CaptainAdminFeeRouteNotice teamId={team.id} />
          </CaptainPwaModeOnly>
        </main>
      </div>

      <CaptainPwaModeOnly mode="app">
        <CaptainPwaBottomNav
          teamId={team.id}
          squadHref={squadHref}
          unreadMessageCount={unreadMessageCount}
        />
      </CaptainPwaModeOnly>
    </div>
  );
}