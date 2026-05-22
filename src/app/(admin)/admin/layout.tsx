// ========================================
// File: src/app/(admin)/admin/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import { getAdminInboxSummary } from "@/lib/messaging/service";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTeamContactPhoneFallbackBridge from "@/components/admin/communications/AdminTeamContactPhoneFallbackBridge";
import ProspectCommunicationCtaBridge from "@/components/admin/communications/ProspectCommunicationCtaBridge";
import FixtureChangeNotificationSubmitBridge from "@/components/admin/fixtures/FixtureChangeNotificationSubmitBridge";
import AdminLeadEditButtonBridge from "@/components/admin/leads/AdminLeadEditButtonBridge";
import QueuedSmsReasonHints from "@/components/admin/messages/QueuedSmsReasonHints";
import AdminPlayerFeePaymentLabelsBridge from "@/components/admin/payments/AdminPlayerFeePaymentLabelsBridge";
import AdminVoidPaymentChargesBridge from "@/components/admin/payments/AdminVoidPaymentChargesBridge";
import AdminSocialResultsGeneratorLinksBridge from "@/components/admin/social/AdminSocialResultsGeneratorLinksBridge";
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
      <AppHeader variant="admin" />

      <div className="flex w-full gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <AdminSidebar
            name={name}
            email={email}
            unreadMessagingCount={inboxSummary.unreadThreads}
          />
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
