import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import CaptainCollectedCreditOptions from "@/components/captain/CaptainCollectedCreditOptions";
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
      <div className="flex justify-end">
        <Link
          href={`/captain/team/${teamid}/payments/credit-ledger`}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-400/15"
        >
          View team credit ledger
        </Link>
      </div>
      <CaptainCollectedCreditOptions teamId={teamid} />
      <CaptainCollectedRemittancePanel teamId={teamid} />
      {children}
    </div>
  );
}
