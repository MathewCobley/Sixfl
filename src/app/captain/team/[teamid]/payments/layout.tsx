import { Suspense, type ReactNode } from "react";

import CaptainCollectedRemittanceNotice from "@/components/captain/CaptainCollectedRemittanceNotice";
import CaptainCollectedRemittancePanel from "@/components/captain/CaptainCollectedRemittancePanel";

export default async function CaptainPaymentsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;

  return (
    <div className="space-y-8">
      <Suspense>
        <CaptainCollectedRemittanceNotice />
      </Suspense>
      <CaptainCollectedRemittancePanel teamId={teamid} />
      {children}
    </div>
  );
}
