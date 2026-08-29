"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AdminLeadCallStatusBridge = dynamic(
  () => import("@/components/admin/leads/AdminLeadCallStatusBridge"),
  { ssr: false },
);
const LeagueFreeKitOfferBridge = dynamic(
  () => import("@/components/admin/leagues/LeagueFreeKitOfferBridge"),
  { ssr: false },
);
const TeamFreeKitOfferOverrideBridge = dynamic(
  () => import("@/components/admin/teams/TeamFreeKitOfferOverrideBridge"),
  { ssr: false },
);
const NightBoardFixtureIssuesLink = dynamic(
  () => import("@/components/admin/night-board/NightBoardFixtureIssuesLink"),
  { ssr: false },
);
const NightBoardPitchSheetsLink = dynamic(
  () => import("@/components/admin/night-board/NightBoardPitchSheetsLink"),
  { ssr: false },
);
const NightBoardTeamIssuesPanel = dynamic(
  () => import("@/components/admin/night-board/NightBoardTeamIssuesPanel"),
  { ssr: false },
);
const NightBoardWarningsPositionBridge = dynamic(
  () => import("@/components/admin/night-board/NightBoardWarningsPositionBridge"),
  { ssr: false },
);
const AdminPaymentsPageBridge = dynamic(
  () => import("@/components/admin/payments/AdminPaymentsPageBridge"),
  { ssr: false },
);
const AdminRefereeControlsLabelBridge = dynamic(
  () => import("@/components/admin/referee-nights/AdminRefereeControlsLabelBridge"),
  { ssr: false },
);
const RefereeNightCleanupBridge = dynamic(
  () => import("@/components/admin/referee-nights/RefereeNightCleanupBridge"),
  { ssr: false },
);
const CaptainAdditionalCaptainBridge = dynamic(
  () => import("@/components/captain/CaptainAdditionalCaptainBridge"),
  { ssr: false },
);
const CaptainHeaderLeaguePositionBridge = dynamic(
  () => import("@/components/captain/CaptainHeaderLeaguePositionBridge"),
  { ssr: false },
);
const CaptainPlayerModeBridge = dynamic(
  () => import("@/components/captain/CaptainPlayerModeBridge"),
  { ssr: false },
);
const CaptainStoredPredictionBridge = dynamic(
  () => import("@/components/captain/CaptainStoredPredictionBridge"),
  { ssr: false },
);
const FixturePaymentWordingBridge = dynamic(
  () => import("@/components/captain/FixturePaymentWordingBridge"),
  { ssr: false },
);
const HideImpossibleLeaguePositionBridge = dynamic(
  () => import("@/components/captain/HideImpossibleLeaguePositionBridge"),
  { ssr: false },
);
const TemporaryPlayerPassLauncher = dynamic(
  () => import("@/components/captain/TemporaryPlayerPassLauncher"),
  { ssr: false },
);
const TemporaryPlayerRequestsPanel = dynamic(
  () => import("@/components/captain/TemporaryPlayerRequestsPanel"),
  { ssr: false },
);
const NorthallertonWaitingListCopyBridge = dynamic(
  () => import("@/components/public/NorthallertonWaitingListCopyBridge"),
  { ssr: false },
);
const ReopenedNightAccessBridge = dynamic(
  () => import("@/components/referee/ReopenedNightAccessBridge"),
  { ssr: false },
);
const SixflTvFixtureBridge = dynamic(
  () => import("@/components/SixflTvFixtureBridge"),
  { ssr: false },
);

export default function RouteScopedBridges() {
  const pathname = usePathname();

  // The main team dashboards are fully rendered by their native React pages.
  // Do not mount legacy DOM-mutating bridges on those roots. The temporary
  // player launcher is safe here because it is an owned React component/portal
  // and does not scrape or rewrite the dashboard DOM.
  const isCaptainTeamRoot = /^\/captain\/team\/[^/]+\/?$/.test(pathname);
  const isPlayerTeamRoot = /^\/player\/team\/[^/]+\/?$/.test(pathname);
  if (isCaptainTeamRoot) return null;
  if (isPlayerTeamRoot) return <TemporaryPlayerPassLauncher />;

  const isAdmin = pathname.startsWith("/admin");
  const isAdminLeadsRoot = pathname === "/admin/leads";
  const isCaptain = pathname.startsWith("/captain/");
  const isPlayer = pathname.startsWith("/player/");
  const isCaptainMatchFees = /^\/captain\/team\/[^/]+\/match-fees\/?$/.test(pathname);
  const isAdminLeagues = pathname.startsWith("/admin/leagues/");
  const isAdminTeam = /^\/admin\/teams\/[^/]+\/?$/.test(pathname);
  const isAdminRefereeNightsRoot = pathname === "/admin/referee-nights";
  const isPublicLeague = pathname.startsWith("/leagues/");
  const isNightBoard = pathname.startsWith("/admin/night-board");
  const isAdminPayments = pathname.startsWith("/admin/payments");
  const isAdminFixtures = pathname.startsWith("/admin/fixtures");
  const isReferee = pathname.startsWith("/referee");

  return (
    <>
      {isAdmin ? <AdminRefereeControlsLabelBridge /> : null}
      {isAdminLeadsRoot ? <AdminLeadCallStatusBridge /> : null}
      {isAdminRefereeNightsRoot ? <RefereeNightCleanupBridge /> : null}

      {(isAdminLeagues || isCaptain || isPublicLeague) ? <LeagueFreeKitOfferBridge /> : null}
      {isAdminTeam ? <TeamFreeKitOfferOverrideBridge /> : null}

      {isNightBoard ? (
        <>
          <NightBoardTeamIssuesPanel />
          <NightBoardFixtureIssuesLink />
          <NightBoardPitchSheetsLink />
          <NightBoardWarningsPositionBridge />
        </>
      ) : null}

      {isAdminPayments ? <AdminPaymentsPageBridge /> : null}

      {isCaptain ? (
        <>
          <CaptainAdditionalCaptainBridge />
          <CaptainHeaderLeaguePositionBridge />
          <CaptainPlayerModeBridge />
          <CaptainStoredPredictionBridge />
          <FixturePaymentWordingBridge />
          <HideImpossibleLeaguePositionBridge />
        </>
      ) : null}

      {(isPlayer || isCaptainMatchFees) ? <TemporaryPlayerPassLauncher /> : null}
      {isCaptainMatchFees ? <TemporaryPlayerRequestsPanel /> : null}
      {isPublicLeague ? <NorthallertonWaitingListCopyBridge /> : null}
      {isReferee ? <ReopenedNightAccessBridge /> : null}
      {(isAdminFixtures || isCaptain) ? <SixflTvFixtureBridge /> : null}
    </>
  );
}
