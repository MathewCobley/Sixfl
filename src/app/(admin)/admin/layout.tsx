// ========================================
// File: src/app/(admin)/admin/layout.tsx
// ========================================

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ResultDisputeStatus } from "@prisma/client";

import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminSixflSupportNeedsReplyCount } from "@/lib/admin/app-messaging";
import { getAdminInboxSummary } from "@/lib/messaging/service";
import { getNextNightBoardIssueSummary } from "@/lib/night-board/next-night-issues";
import { prisma } from "@/lib/prisma";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTeamContactPhoneFallbackBridge from "@/components/admin/communications/AdminTeamContactPhoneFallbackBridge";
import ProspectCommunicationCtaBridge from "@/components/admin/communications/ProspectCommunicationCtaBridge";
import EmailBrandOptionBridge from "@/components/admin/email-templates/EmailBrandOptionBridge";
import EmailTemplateListControlsBridge from "@/components/admin/email-templates/EmailTemplateListControlsBridge";
import PlayerPoolTemplateCtaBridge from "@/components/admin/email-templates/PlayerPoolTemplateCtaBridge";
import FixtureCardResultLinksBridge from "@/components/admin/fixtures/FixtureCardResultLinksBridge";
import FixtureSeasonWordingBridge from "@/components/admin/fixtures/FixtureSeasonWordingBridge";
import FixtureChangeNotificationSubmitBridge from "@/components/admin/fixtures/FixtureChangeNotificationSubmitBridge";
import AdminLeadEditButtonBridge from "@/components/admin/leads/AdminLeadEditButtonBridge";
import LeadDiallerLaunchButton from "@/components/admin/leads/LeadDiallerLaunchButton";
import AdminDivisionSelectBridge from "@/components/admin/leagues/AdminDivisionSelectBridge";
import AdminLeagueSeasonsBridge from "@/components/admin/leagues/AdminLeagueSeasonsBridge";
import NightBoardSaveNotice from "@/components/admin/night-board/NightBoardSaveNotice";
import AdminDeliveryIssueBanner from "@/components/admin/notifications/AdminDeliveryIssueBanner";
import AdminPlayerFeePaymentLabelsBridge from "@/components/admin/payments/AdminPlayerFeePaymentLabelsBridge";
import AdminVoidPaymentChargesBridge from "@/components/admin/payments/AdminVoidPaymentChargesBridge";
import PlayerPoolNudgeBridge from "@/components/admin/player-pool/PlayerPoolNudgeBridge";
import AdminQueueItemDetailsLinksBridge from "@/components/admin/queue/AdminQueueItemDetailsLinksBridge";
import RefereeNightCashDistributionBridge from "@/components/admin/referee-nights/RefereeNightCashDistributionBridge";
import RefereeNightFixtureSyncBridge from "@/components/admin/referee-nights/RefereeNightFixtureSyncBridge";
import AdminRefereeCommsHistoryBridge from "@/components/admin/referees/AdminRefereeCommsHistoryBridge";
import RefereeWelcomeInviteBridge from "@/components/admin/referees/RefereeWelcomeInviteBridge";
import AdminSocialResultsGeneratorLinksBridge from "@/components/admin/social/AdminSocialResultsGeneratorLinksBridge";
import FreeKitTeamBadgesBridge from "@/components/admin/teams/FreeKitTeamBadgesBridge";
import RemoveDuplicateLatestKickoffBridge from "@/components/admin/teams/RemoveDuplicateLatestKickoffBridge";
import TeamCompetitionPickerBridge from "@/components/admin/teams/TeamCompetitionPickerBridge";
import TeamReplaceFixturesButtonBridge from "@/components/admin/teams/TeamReplaceFixturesButtonBridge";
import TeamStandardMatchFeeBridge from "@/components/admin/teams/TeamStandardMatchFeeBridge";
import AppHeader from "@/components/layout/AppHeader";
import FootageUploadProvider from "@/components/admin/sixfl-tv/FootageUploadProvider";
import PwaAppFrame, { type PwaAppNavItem } from "@/components/pwa/PwaAppFrame";
import AdminDeploymentRecovery from "@/components/admin/AdminDeploymentRecovery";

function formatAdminAppDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/London",
  }).format(value);
}

function getAdminInitials(name: string, email: string) {
  const source = name.trim() && name !== "Admin" ? name.trim() : email.split("@")[0] ?? "A";
  const parts = source.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "A";
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [
    { session, user },
    inboxSummary,
    sixflSupportNeedsReplyCount,
    openDisputeCount,
    nextNightBoardIssues,
  ] = await Promise.all([
    requireAdmin(),
    getAdminInboxSummary(),
    getAdminSixflSupportNeedsReplyCount(),
    prisma.resultDispute.count({
      where: {
        status: {
          in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.REVIEW],
        },
      },
    }),
    getNextNightBoardIssueSummary(),
  ]);

  const email = user?.email ?? session?.user?.email ?? "Admin";
  const name = user?.name ?? session?.user?.name ?? "Admin";
  const totalMessagingAlertCount =
    inboxSummary.unreadThreads + sixflSupportNeedsReplyCount;
  const appNavItems: PwaAppNavItem[] = [
    { href: "/admin", label: "Home", icon: "home", exact: true },
    { href: "/admin/teams", label: "Teams", icon: "teams" },
    { href: "/admin/fixtures", label: "Fixtures", icon: "fixtures" },
    {
      href: "/admin/messages",
      label: "Inbox",
      icon: "inbox",
      badgeCount: totalMessagingAlertCount,
    },
    { href: "/admin/more", label: "More", icon: "more", fallback: true },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <AdminDeploymentRecovery />
      <style>{`
        button[aria-label^="Open team-raised fixture issues"] {
          top: 17rem !important;
          right: 1.25rem !important;
          bottom: auto !important;
        }

        @media (min-width: 640px) {
          button[aria-label^="Open team-raised fixture issues"] {
            right: 1.5rem !important;
          }
        }
      `}</style>
      <NightBoardSaveNotice />
      <FixtureChangeNotificationSubmitBridge />
      <FixtureCardResultLinksBridge />
      <FixtureSeasonWordingBridge />
      <ProspectCommunicationCtaBridge />
      <AdminTeamContactPhoneFallbackBridge />
      <AdminVoidPaymentChargesBridge />
      <AdminPlayerFeePaymentLabelsBridge />
      <AdminLeadEditButtonBridge />
      <AdminSocialResultsGeneratorLinksBridge />
      <EmailTemplateListControlsBridge />
      <EmailBrandOptionBridge />
      <PlayerPoolTemplateCtaBridge />
      <PlayerPoolNudgeBridge />
      <AdminQueueItemDetailsLinksBridge />
      <AdminLeagueSeasonsBridge />
      <AdminDivisionSelectBridge />
      <FreeKitTeamBadgesBridge />
      <RemoveDuplicateLatestKickoffBridge />
      <TeamCompetitionPickerBridge />
      <TeamReplaceFixturesButtonBridge />
      <TeamStandardMatchFeeBridge />
      <RefereeNightFixtureSyncBridge />
      <RefereeNightCashDistributionBridge />
      <AdminRefereeCommsHistoryBridge />
      <RefereeWelcomeInviteBridge />
      <PwaAppFrame
        title="Admin"
        dateLabel={formatAdminAppDate(new Date())}
        profileInitials={getAdminInitials(name, email)}
        profileHref="/admin/more"
        notificationHref={
          sixflSupportNeedsReplyCount > 0
            ? "/admin/chat#sixfl-inbox"
            : "/admin/messages?filter=unread"
        }
        notificationCount={totalMessagingAlertCount}
        navItems={appNavItems}
      />

      <div className="pwa-web-chrome">
        <AppHeader variant="admin" />
      </div>

      <nav aria-label="Admin reports" className="pwa-web-chrome border-b border-white/10 px-3 py-3 sm:px-6 lg:px-8 xl:hidden">
        <Link
          href="/admin/matchweek-reports"
          className="inline-flex min-h-10 items-center rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400"
        >
          Matchweek reports
        </Link>
      </nav>

      <div className="pwa-app-content-shell flex w-full gap-5 px-3 py-4 sm:px-6 lg:px-8 lg:py-6">
        <aside className="pwa-web-chrome hidden w-[34rem] shrink-0 xl:block 2xl:w-[38rem]">
          <AdminSidebar
            name={name}
            email={email}
            unreadMessagingCount={inboxSummary.unreadThreads}
            sixflSupportNeedsReplyCount={sixflSupportNeedsReplyCount}
            openDisputeCount={openDisputeCount}
            nightBoardIssueCount={nextNightBoardIssues.count}
            nightBoardIssueLevel={nextNightBoardIssues.level}
            nightBoardIssueDate={nextNightBoardIssues.dateLabel}
          />
        </aside>

        <div className="pwa-app-main w-full min-w-0 flex-1">
          <div className="space-y-5">
            <AdminDeliveryIssueBanner />
            <Suspense fallback={null}>
              <LeadDiallerLaunchButton />
            </Suspense>
            <main className="w-full min-w-0 flex-1"><FootageUploadProvider key={user?.id || email}>{children}</FootageUploadProvider></main>
          </div>
        </div>
      </div>
    </div>
  );
}
