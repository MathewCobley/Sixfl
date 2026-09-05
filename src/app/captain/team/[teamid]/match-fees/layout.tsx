import { Suspense, type ReactNode } from "react";
import { requireCaptain } from "@/lib/requireCaptain";
import { canManageGuestApprovals } from "@/lib/fixtures/guest-approval-policy";
import FixtureGuestApprovals from "@/components/captain/FixtureGuestApprovals";

export default async function MatchdaySquadLayout({ children, params }: {
  children: ReactNode; params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <FixtureGuestApprovals teamId={teamid} canManage={canManageGuestApprovals(access)} />
      </Suspense>
      {children}
    </div>
  );
}
