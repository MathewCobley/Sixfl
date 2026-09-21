"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserCircleIcon } from "@heroicons/react/24/solid";

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

  const teamLabel = [leagueName, season].filter(Boolean).join(" · ");

  return (
    <>
      <style>{`
        .player-pwa-portal-header {
          display: none;
        }

        body:has(.player-pwa-mode) .player-pwa-portal-header {
          display: block !important;
        }

        body:has(.player-pwa-mode) .player-temporary-pass-launcher,
        body:has(.player-pwa-mode) .player-team-layout main section.sticky.z-50,
        body:has(.player-pwa-mode) .player-team-layout main section:has(a[href="/player/referrals"]) {
          display: none !important;
        }

        body:has(.player-pwa-mode) .player-team-layout > main {
          padding: 0 !important;
          min-height: auto !important;
        }

        body:has(.player-pwa-mode) .player-team-layout {
          padding-bottom: calc(4.8rem + env(safe-area-inset-bottom));
        }
      `}</style>

      <div className={appMode ? "player-pwa-mode" : "player-pwa-controller"} />

      <header
        className="player-pwa-portal-header sticky top-0 z-40 border-b border-white/[0.07] bg-[#06110e]/95 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.8rem)" }}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <Image
            src="/logo2.png"
            alt="SIXFL"
            width={180}
            height={48}
            priority
            className="h-7 w-auto object-contain"
          />

          <div className="min-w-0 flex-1 text-center">
            <div className="text-sm font-black tracking-tight text-white">
              Player Portal
            </div>
            <div className="mt-0.5 truncate text-[10px] text-white/35">
              {teamLabel || teamName}
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
            {teamLogoUrl ? (
              <img
                src={teamLogoUrl}
                alt={`${teamName} badge`}
                className="h-full w-full object-contain"
              />
            ) : (
              <UserCircleIcon className="h-7 w-7 text-white/55" />
            )}
          </div>
        </div>
      </header>
    </>
  );
}
