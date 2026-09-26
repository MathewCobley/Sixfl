import { Suspense, type ReactNode } from "react";

import CaptainPwaModeOnly from "@/components/captain/CaptainPwaModeOnly";
import FixtureGuestApprovals from "@/components/captain/FixtureGuestApprovals";
import { canManageGuestApprovals } from "@/lib/fixtures/guest-approval-policy";
import { requireCaptain } from "@/lib/requireCaptain";

export default async function SquadPaymentsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const access = await requireCaptain(teamid);
  const canManage = canManageGuestApprovals(access);

  return (
    <>
      <CaptainPwaModeOnly mode="app">
        <div className="space-y-3">
          {children}
          <details className="overflow-hidden rounded-[1.2rem] border border-emerald-400/20 bg-emerald-500/[0.055]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-black text-white [&::-webkit-details-marker]:hidden">
              <span>
                Guest approvals
                <span className="ml-2 font-medium text-white/35">Fixture-specific</span>
              </span>
              <span aria-hidden="true" className="text-lg font-normal text-emerald-200/45">›</span>
            </summary>
            <div className="captain-app-payment-guest border-t border-white/[0.07] p-2">
              <Suspense fallback={null}>
                <FixtureGuestApprovals teamId={teamid} canManage={canManage} />
              </Suspense>
            </div>
          </details>
        </div>
      </CaptainPwaModeOnly>

      <CaptainPwaModeOnly mode="web">
        <div className="space-y-6">
          <Suspense fallback={null}>
            <FixtureGuestApprovals teamId={teamid} canManage={canManage} />
          </Suspense>
          {children}
        </div>
      </CaptainPwaModeOnly>
    </>
  );
}
