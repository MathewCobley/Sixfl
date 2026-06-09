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
    { href: `/captain/team/${teamid}/player-payments`, label: "Squad payments" },
    ...(isManagedTeam
      ? [
          { href: `/captain/team/${teamid}/prospects`, label: "Prospects" },
          { href: `/captain/team/${teamid}/match-fees`, label: "Matchday squad" },
        ]
      : []),
    { href: `/captain/team/${teamid}/availability`, label: "Availability" },
    { href: `/captain/team/${teamid}/fixtures`, label: "Fixtures" },
    { href: `/captain/team/${teamid}/results`, label: "Results" },
    ...(showTeamPayments
      ? [{ href: `/captain/team/${teamid}/payments`, label: "Team payments" }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-[#07130f] text-white">
      <CaptainRedirectErrorNoticeFix />
      <QueuedSmsReasonHints />
      <ProspectsReadableLayout />
      <CaptainFixtureBadgesBridge />
      <CaptainMatchdayAvailabilityBadgesBridge />
      {access.isAdmin && isManagedTeam ? <ManagedSquadEditLinks /> : null}
      {access.isAdmin && isManagedTeam ? <ManagedProspectMoveLinks /> : null}
      {access.isAdmin && isManagedTeam ? <PendingActivationDeleteLinks /> : null}
      {access.isAdmin && isManagedTeam ? <AdminPlayerPreviewLinks /> : null}

      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-6 py-6 sm:px-10">
        <header className="overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-emerald-400/20 bg-black/30 shadow-[0_14px_40px_rgba(0,0,0,0.35)] sm:h-24 sm:w-24">
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

                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    {team.name}
                  </h1>

                  <p className="mt-3 text-sm text-white/55">
                    {team.league?.name ?? "No league assigned"}
                    {team.league?.season ? ` · ${team.league.season}` : ""}
                    {team.league?.isActive ? " · Live season" : ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2 px-6 py-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}
