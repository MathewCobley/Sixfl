"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type LegacyOfferResponse = {
  legacyOffer?: boolean;
};

function getKitTeamId(pathname: string) {
  return pathname.match(/^\/captain\/team\/([^/]+)\/kit(?:\/|$)/)?.[1] ?? null;
}

export default function LegacyFreeKitOfferCopyBridge() {
  const pathname = usePathname();
  const [legacyOffer, setLegacyOffer] = useState(false);

  useEffect(() => {
    const teamId = getKitTeamId(pathname);
    if (!teamId) {
      setLegacyOffer(false);
      return;
    }

    let cancelled = false;

    fetch(`/api/captain/team/${encodeURIComponent(teamId)}/legacy-kit-offer`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | LegacyOfferResponse
          | null;

        if (!cancelled) {
          setLegacyOffer(Boolean(response.ok && payload?.legacyOffer));
        }
      })
      .catch(() => {
        if (!cancelled) setLegacyOffer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!legacyOffer) return null;

  return (
    <section className="mb-6 rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.08] p-5 sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/75">
        Original offer protected
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">
        Your free kit offer is being honoured
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
        Your team selected the founding-team free kit offer before the website changed.
        The new £90 contribution does not apply to this original nine-kit order.
      </p>
    </section>
  );
}
