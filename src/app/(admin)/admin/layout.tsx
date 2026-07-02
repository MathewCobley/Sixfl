// ========================================
// File: src/app/(admin)/admin/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminInboxSummary } from "@/lib/messaging/service";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminSidebarDesktopColumnsBridge from "@/components/admin/AdminSidebarDesktopColumnsBridge";
import AdminTeamContactPhoneFallbackBridge from "@/components/admin/communications/AdminTeamContactPhoneFallbackBridge";
import ProspectCommunicationCtaBridge from "@/components/admin/communications/ProspectCommunicationCtaBridge";
import EmailTemplateListControlsBridge from "@/components/admin/email-templates/EmailTemplateListControlsBridge";
import GenerateNextWeekFixturesBridge from "@/components/admin/fixtures/GenerateNextWeekFixturesBridge";
import FixtureChangeNotificationSubmitBridge from "@/components/admin/fixtures/FixtureChangeNotificationSubmitBridge";
import AdminLeadEditButtonBridge from "@/components/admin/leads/AdminLeadEditButtonBridge";
import QueuedSmsReasonHints from "@/components/admin/messages/QueuedSmsReasonHints";
import AdminPlayerFeePaymentLabelsBridge from "@/components/admin/payments/AdminPlayerFeePaymentLabelsBridge";
import AdminVoidPaymentChargesBridge from "@/components/admin/payments/AdminVoidPaymentChargesBridge";
import PlayerProspectsNotInterestedBridge from "@/components/admin/player-prospects/PlayerProspectsNotInterestedBridge";
import RefereeNightCashDistributionBridge from "@/components/admin/referee-nights/RefereeNightCashDistributionBridge";
import RefereeNightFixtureSyncBridge from "@/components/admin/referee-nights/RefereeNightFixtureSyncBridge";
import AdminRefereeCommsHistoryBridge from "@/components/admin/referees/AdminRefereeCommsHistoryBridge";
import RefereeWelcomeInviteBridge from "@/components/admin/referees/RefereeWelcomeInviteBridge";
import AdminSocialResultsGeneratorLinksBridge from "@/components/admin/social/AdminSocialResultsGeneratorLinksBridge";
import TeamDivisionPickerBridge from "@/components/admin/teams/TeamDivisionPickerBridge";
import TeamReplaceFixturesButtonBridge from "@/components/admin/teams/TeamReplaceFixturesButtonBridge";
import AppHeader from "@/components/layout/AppHeader";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [{ session, user }, inboxSummary] = await Promise.all([
    requireAdmin(),
    getAdminInboxSummary(),
  ]);

  const email = user?.email ?? session?.user?.email ?? "Admin";
  const name = user?.name ?? session?.user?.name ?? "Admin";

  return (
    <div className="min-h-screen bg-black text-white">
      <QueuedSmsReasonHints />
      <FixtureChangeNotificationSubmitBridge />
      <ProspectCommunicationCtaBridge />
      <AdminTeamContactPhoneFallbackBridge />
      <AdminVoidPaymentChargesBridge />
      <AdminPlayerFeePaymentLabelsBridge />
      <AdminLeadEditButtonBridge />
      <AdminSocialResultsGeneratorLinksBridge />
      <EmailTemplateListControlsBridge />
      <PlayerProspectsNotInterestedBridge />
      <GenerateNextWeekFixturesBridge />
      <AdminSidebarDesktopColumnsBridge />
      <TeamDivisionPickerBridge />
      <TeamReplaceFixturesButtonBridge />
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
          />
        </aside>

        <main className="w-full min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
