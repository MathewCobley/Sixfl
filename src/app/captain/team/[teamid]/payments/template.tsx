"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const RECOVERY_MARKER = "sixfl-collected-remittance-cancel-recovery";

export default function PaymentsTemplate({ children }: { children: React.ReactNode }) {
  const params = useParams<{ teamid: string }>();
  const teamId = String(params?.teamid ?? "");
  const [showBackRecovery, setShowBackRecovery] = useState(false);

  useEffect(() => {
    if (!teamId) return;

    const query = new URLSearchParams(window.location.search);
    const remitState = query.get("remit");

    if (remitState === "cancelled") {
      const alreadyRecovering = window.sessionStorage.getItem(RECOVERY_MARKER) === teamId;

      if (!alreadyRecovering) {
        window.sessionStorage.setItem(RECOVERY_MARKER, teamId);
        window.location.replace(
          `/captain/team/${encodeURIComponent(teamId)}/payments/remit-collected/cancel`,
        );
        return;
      }

      window.sessionStorage.removeItem(RECOVERY_MARKER);
      window.history.replaceState({}, "", window.location.pathname);
    }

    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation?.type === "back_forward" || navigation?.type === "reload") {
      setShowBackRecovery(true);
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setShowBackRecovery(true);
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [teamId]);

  return (
    <>
      {showBackRecovery && teamId ? (
        <div className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-50">
          <p className="font-semibold">Returned from Stripe without paying?</p>
          <p className="mt-1 leading-5 text-amber-50/75">
            If you came back without completing the payment, Stripe may still show the collected-money checkout as active. Cancel it here to release the amount and make the payment button available again.
          </p>
          <form
            action={`/captain/team/${teamId}/payments/remit-collected/cancel`}
            method="post"
            className="mt-3"
          >
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-200/25 bg-black/20 px-4 text-xs font-semibold text-amber-50 transition hover:bg-black/30"
            >
              Cancel pending Stripe checkout
            </button>
          </form>
        </div>
      ) : null}
      {children}
    </>
  );
}
