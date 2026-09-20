"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function isPwaPhonePreviewFrame() {
  try {
    return (
      window.self !== window.top &&
      window.parent.location.origin === window.location.origin &&
      window.parent.location.pathname === "/admin/pwa"
    );
  } catch {
    return false;
  }
}

export default function PlayerPwaPortalHeader({
  teamName,
  teamLogoUrl,
  leagueName,
  season,
}: {
  teamName: string;
  teamLogoUrl: string | null;
  leagueName: string | null;
  season: string | null;
}) {
  const searchParams = useSearchParams();
  const [appMode, setAppMode] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const explicitPreview = searchParams.get("pwaPreview") === "1";

    setAppMode(
      standalone || iosStandalone || explicitPreview || isPwaPhonePreviewFrame(),
    );
  }, [searchParams]);

  const initials =
    teamName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "S";

  return (
    <>
      <style>{`
        .player-pwa-portal-header {
          display: none;
        }

        body:has(.player-pwa-mode) .player-pwa-portal-header {
          display: block;
        }

        body:has(.player-pwa-mode) .player-overview-identity {
          display: none !important;
        }

        body:has(.player-pwa-mode) .player-team-layout main section.sticky.z-50 {
          display: none !important;
        }

        body:has(.player-pwa-mode) .player-team-layout main section:has(a[href="/player/referrals"]) {
          display: none !important;
        }

        body:has(.player-pwa-mode) .player-team-layout > main {
          padding-top: 0.9rem !important;
        }
      `}</style>

      <div className={appMode ? "player-pwa-mode" : "player-pwa-controller"} />

      <section className="player-pwa-portal-header mx-auto w-full max-w-6xl px-4 pt-4">
        <div className="overflow-hidden rounded-[1.6rem] border border-emerald-400/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.32)]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-400/20 bg-black/30">
              {teamLogoUrl ? (
                <img
                  src={teamLogoUrl}
                  alt={`${teamName} badge`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xl font-black text-emerald-100">
                  {initials}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300/80">
                Player Portal
              </div>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white">
                {teamName}
              </h1>
              <p className="mt-1 truncate text-xs text-white/50">
                {leagueName ?? "SIXFL"}
                {season ? ` · ${season}` : ""}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
