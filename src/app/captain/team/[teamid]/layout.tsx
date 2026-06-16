// ========================================
// File: src/app/captain/team/[teamid]/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import AdminPlayerPreviewLinks from "@/components/captain/AdminPlayerPreviewLinks";
import CaptainFixtureBadgesBridge from "@/components/captain/CaptainFixtureBadgesBridge";
import CaptainMatchdayAvailabilityBadgesBridge from "@/components/captain/CaptainMatchdayAvailabilityBadgesBridge";
import CaptainRedirectErrorNoticeFix from "@/components/captain/CaptainRedirectErrorNoticeFix";
import CaptainViewModeHeader from "@/components/captain/CaptainViewModeHeader";
import ManagedProspectMoveLinks from "@/components/captain/ManagedProspectMoveLinks";
import ManagedSquadEditLinks from "@/components/captain/ManagedSquadEditLinks";
import PendingActivationDeleteLinks from "@/components/captain/PendingActivationDeleteLinks";
import ProspectsReadableLayout from "@/components/captain/ProspectsReadableLayout";
import QueuedSmsReasonHints from "@/components/admin/messages/QueuedSmsReasonHints";
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
    display: flex;
    flex-wrap: nowrap;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.75rem 1rem 1rem;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }

  .captain-team-shell .captain-team-nav a {
    min-height: 2.5rem;
    flex: 0 0 auto;
    scroll-snap-align: start;
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
          season: true,
          isActive: true,
        },
      },
    },
  });

  if (!team) {
    notFound();
  }

  const isManagedTeam = team.teamMode === "MANAGED";
  const showTeamPayments = !isManagedTeam || access.isAdmin;

  const squadHref = access.isAdmin
    ? `/captain/team/${teamid}/squad`
    : `/captain/team/${teamid}/captain-squad`;

  const navItems = [
    { href: `/captain/team/${teamid}`, label: "Overview" },
    { href: squadHref, label: "Squad" },
    ...(access.isAdmin
      ? [{ href: `/captain/team/${teamid}/prospects`, label: "Prospects" }]
      : []),
    { href: `/captain/team/${teamid}/player-payments`, label: "Squad payments" },
    { href: `/captain/team/${teamid}/match-fees`, label: "Matchday squad" },
    { href: `/captain/team/${teamid}/availability`, label: "Availability" },
    { href: `/captain/team/${teamid}/fixtures`, label: "Fixtures" },
    { href: `/captain/team/${teamid}/results`, label: "Results" },
    ...(showTeamPayments
      ? [{ href: `/captain/team/${teamid}/payments`, label: "Team payments" }]
      : []),
  ];

  return (
    <div className="captain-team-shell min-h-screen bg-[#07130f] text-white">
      <style>{captainMobileStyles}</style>
      <CaptainRedirectErrorNoticeFix />
      <QueuedSmsReasonHints />
      <ProspectsReadableLayout />
      <CaptainFixtureBadgesBridge />
      <CaptainMatchdayAvailabilityBadgesBridge />
      {access.isAdmin && isManagedTeam ? <ManagedSquadEditLinks /> : null}
      {access.isAdmin && isManagedTeam ? <ManagedProspectMoveLinks /> : null}
      {access.isAdmin && isManagedTeam ? <PendingActivationDeleteLinks /> : null}
      {access.isAdmin && isManagedTeam ? <AdminPlayerPreviewLinks /> : null}

      <div className="captain-team-container mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-3 py-4 sm:gap-8 sm:px-10 sm:py-6">
        <header className="captain-team-header overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:rounded-3xl">
          <div className="captain-team-header-top border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
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
                  <CaptainViewModeHeader
                    teamId={team.id}
                    isAdmin={access.isAdmin}
                    isManagedTeam={isManagedTeam}
                  />

                  <h1 className="captain-team-heading mt-2 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                    {team.name}
                  </h1>

                  <p className="captain-team-meta mt-3 text-sm text-white/55">
                    {team.league?.name ?? "No league assigned"}
                    {team.league?.season ? ` · ${team.league.season}` : ""}
                    {team.league?.isActive ? " · Live season" : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <nav className="captain-team-nav sixfl-mobile-scroll flex gap-2 overflow-x-auto px-4 py-3 sm:flex-wrap sm:overflow-visible sm:px-6 sm:py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="captain-team-main min-w-0">{children}</main>
      </div>
    </div>
  );
}
