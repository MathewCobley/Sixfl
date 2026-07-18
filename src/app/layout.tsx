// ========================================
// File: src/app/layout.tsx
// ========================================

import "./globals.css";
import "./mobile.css";
import "./team-badge-sizing.css";
import "./hide-old-fixture-generator.css";
import { Suspense, type ReactNode } from "react";
import NightBoardFixtureIssuesLink from "@/components/admin/night-board/NightBoardFixtureIssuesLink";
import NightBoardMatchFeeSyncBridge from "@/components/admin/night-board/NightBoardMatchFeeSyncBridge";
import NightBoardTeamIssuesPanel from "@/components/admin/night-board/NightBoardTeamIssuesPanel";
import NightBoardWarningsPositionBridge from "@/components/admin/night-board/NightBoardWarningsPositionBridge";
import AdminPaymentsPageBridge from "@/components/admin/payments/AdminPaymentsPageBridge";
import CaptainFixturesDeduplicateBridge from "@/components/captain/CaptainFixturesDeduplicateBridge";
import CaptainHeaderLeaguePositionBridge from "@/components/captain/CaptainHeaderLeaguePositionBridge";
import HideImpossibleLeaguePositionBridge from "@/components/captain/HideImpossibleLeaguePositionBridge";
import InjuredPlayerAvailabilityBridge from "@/components/captain/InjuredPlayerAvailabilityBridge";
import TeamAutoPayCopyBridge from "@/components/captain/TeamAutoPayCopyBridge";
import NorthallertonWaitingListCopyBridge from "@/components/public/NorthallertonWaitingListCopyBridge";
import SixflTvFixtureBridge from "@/components/SixflTvFixtureBridge";
import Providers from "./providers";

export const metadata = {
  title: "SIXFL",
  description: "Six-a-side football league platform",
  icons: {
    icon: "/icon.png",
  },
};

const safeClosestPatch = String.raw`
(function () {
  if (typeof window === "undefined" || typeof Element === "undefined") return;
  if (window.__sixflSafeClosestPatchApplied) return;

  window.__sixflSafeClosestPatchApplied = true;

  var originalClosest = Element.prototype.closest;

  if (typeof originalClosest !== "function") return;

  function isSimpleClassSelector(selector) {
    return (
      typeof selector === "string" &&
      selector.charAt(0) === "." &&
      !/[\s>+~:#,]/.test(selector)
    );
  }

  function findClosestByClassName(element, selector) {
    var className = selector.slice(1);
    var current = element;

    while (current && current.nodeType === 1) {
      if (current.classList && current.classList.contains(className)) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  function escapeSelector(selector) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function" && isSimpleClassSelector(selector)) {
      return "." + CSS.escape(selector.slice(1));
    }

    return selector
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .replace(/\./g, "\\.");
  }

  Element.prototype.closest = function patchedClosest(selector) {
    try {
      return originalClosest.call(this, selector);
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "SyntaxError") {
        throw error;
      }

      if (typeof selector !== "string" || selector.indexOf("[") === -1) {
        throw error;
      }

      if (isSimpleClassSelector(selector)) {
        return findClosestByClassName(this, selector);
      }

      try {
        return originalClosest.call(this, escapeSelector(selector));
      } catch (_) {
        return null;
      }
    }
  };
})();
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0f14] text-white">
        <script dangerouslySetInnerHTML={{ __html: safeClosestPatch }} />
        <Providers>
          <Suspense fallback={null}>
            <NightBoardMatchFeeSyncBridge />
            <NightBoardTeamIssuesPanel />
            <NightBoardFixtureIssuesLink />
            <NightBoardWarningsPositionBridge />
            <AdminPaymentsPageBridge />
            <CaptainFixturesDeduplicateBridge />
            <CaptainHeaderLeaguePositionBridge />
            <HideImpossibleLeaguePositionBridge />
            <InjuredPlayerAvailabilityBridge />
            <TeamAutoPayCopyBridge />
            <NorthallertonWaitingListCopyBridge />
            <SixflTvFixtureBridge />
          </Suspense>
          {children}
        </Providers>
      </body>
    </html>
  );
}
