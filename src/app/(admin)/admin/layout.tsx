// ========================================
// File: src/app/(admin)/admin/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { ResultDisputeStatus } from "@prisma/client";

import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminInboxSummary } from "@/lib/messaging/service";
import { prisma } from "@/lib/prisma";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminSidebarDesktopColumnsBridge from "@/components/admin/AdminSidebarDesktopColumnsBridge";
import RemoveUnusedSettingsNavBridge from "@/components/admin/RemoveUnusedSettingsNavBridge";
import AdminTeamContactPhoneFallbackBridge from "@/components/admin/communications/AdminTeamContactPhoneFallbackBridge";
import ProspectCommunicationCtaBridge from "@/components/admin/communications/ProspectCommunicationCtaBridge";
import EmailBrandOptionBridge from "@/components/admin/email-templates/EmailBrandOptionBridge";
import EmailTemplateListControlsBridge from "@/components/admin/email-templates/EmailTemplateListControlsBridge";
import PlayerPoolTemplateCtaBridge from "@/components/admin/email-templates/PlayerPoolTemplateCtaBridge";
import FixtureCardResultLinksBridge from "@/components/admin/fixtures/FixtureCardResultLinksBridge";
import FixtureSeasonWordingBridge from "@/components/admin/fixtures/FixtureSeasonWordingBridge";
import GenerateNextWeekFixturesBridge from "@/components/admin/fixtures/GenerateNextWeekFixturesBridge";
import FixtureChangeNotificationSubmitBridge from "@/components/admin/fixtures/FixtureChangeNotificationSubmitBridge";
import AdminLeadEditButtonBridge from "@/components/admin/leads/AdminLeadEditButtonBridge";
import AdminDivisionSelectBridge from "@/components/admin/leagues/AdminDivisionSelectBridge";
import AdminLeagueSeasonTeamsBridge from "@/components/admin/leagues/AdminLeagueSeasonTeamsBridge";
import AdminLeagueSeasonsBridge from "@/components/admin/leagues/AdminLeagueSeasonsBridge";
import QueuedSmsReasonHints from "@/components/admin/messages/QueuedSmsReasonHints";
import AdminPlayerFeePaymentLabelsBridge from "@/components/admin/payments/AdminPlayerFeePaymentLabelsBridge";
import AdminVoidPaymentChargesBridge from "@/components/admin/payments/AdminVoidPaymentChargesBridge";
import PlayerProspectsNotInterestedBridge from "@/components/admin/player-prospects/PlayerProspectsNotInterestedBridge";
import PlayerProspectsPlayerPoolBridge from "@/components/admin/player-prospects/PlayerProspectsPlayerPoolBridge";
import RefereeNightCashDistributionBridge from "@/components/admin/referee-nights/RefereeNightCashDistributionBridge";
import RefereeNightFixtureSyncBridge from "@/components/admin/referee-nights/RefereeNightFixtureSyncBridge";
import AdminRefereeCommsHistoryBridge from "@/components/admin/referees/AdminRefereeCommsHistoryBridge";
import RefereeWelcomeInviteBridge from "@/components/admin/referees/RefereeWelcomeInviteBridge";
import AdminSocialResultsGeneratorLinksBridge from "@/components/admin/social/AdminSocialResultsGeneratorLinksBridge";
import FreeKitTeamBadgesBridge from "@/components/admin/teams/FreeKitTeamBadgesBridge";
import ManagedSquadInjuryBridge from "@/components/admin/teams/ManagedSquadInjuryBridge";
import RemoveDuplicateLatestKickoffBridge from "@/components/admin/teams/RemoveDuplicateLatestKickoffBridge";
import TeamCompetitionPickerBridge from "@/components/admin/teams/TeamCompetitionPickerBridge";
import TeamReplaceFixturesButtonBridge from "@/components/admin/teams/TeamReplaceFixturesButtonBridge";
import TeamStandardMatchFeeBridge from "@/components/admin/teams/TeamStandardMatchFeeBridge";
import AppHeader from "@/components/layout/AppHeader";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [{ session, user }, inboxSummary, openDisputeCount] = await Promise.all([
    requireAdmin(),
    getAdminInboxSummary(),
    prisma.resultDispute.count({
      where: {
        status: {
          in: [ResultDisputeStatus.OPEN, ResultDisputeStatus.REVIEW],
        },
      },
    }),
  ]);

  const email = user?.email ?? session?.user?.email ?? "Admin";
  const name = user?.name ?? session?.user?.name ?? "Admin";

  return (
    <div className="min-h-screen bg-black text-white">
      <QueuedSmsReasonHints />
      <FixtureChangeNotificationSubmitBridge />
      <FixtureCardResultLinksBridge />
      <FixtureSeasonWordingBridge />
      <ProspectCommunicationCtaBridge />
      <AdminTeamContactPhoneFallbackBridge />
      <AdminVoidPaymentChargesBridge />
      <AdminPlayerFeePaymentLabelsBridge />
      <ManagedSquadInjuryBridge />
      <AdminLeadEditButtonBridge />
      <AdminSocialResultsGeneratorLinksBridge />
      <EmailTemplateListControlsBridge />
      <EmailBrandOptionBridge />
      <PlayerPoolTemplateCtaBridge />
      <PlayerProspectsNotInterestedBridge />
      <PlayerProspectsPlayerPoolBridge />
      <GenerateNextWeekFixturesBridge />
      <AdminSidebarDesktopColumnsBridge />
      <RemoveUnusedSettingsNavBridge />
      <AdminLeagueSeasonsBridge />
      <AdminLeagueSeasonTeamsBridge />
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
      <AppHeader variant="admin" />

      <div className="flex w-full gap-5 px-3 py-4 sm:px-6 lg:px-8 lg:py-6">
        <aside className="hidden w-[34rem] shrink-0 xl:block 2xl:w-[38rem]">
          <AdminSidebar
            name={name}
            email={email}
            unreadMessagingCount={inboxSummary.unreadThreads}
            openDisputeCount={openDisputeCount}
          />
        </aside>

        <main className="w-full min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
