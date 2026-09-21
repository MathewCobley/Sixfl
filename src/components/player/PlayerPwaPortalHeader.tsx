"use client";

import Image from "next/image";
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
}: {
  teamName: string;
  teamLogoUrl: string | null;
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
        className="player-pwa-portal-header sticky top-0 z-40 border-b border-white/[0.07] bg-[#07130f]/95 px-4 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <div className="mx-auto grid w-full max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Image
            src="/logo2.png"
            alt="SIXFL"
            width={180}
            height={48}
            priority
            className="h-7 w-auto object-contain"
          />
          <div className="text-sm font-black tracking-tight text-white">
            Player Portal
          </div>
          <div className="flex justify-end">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
              {teamLogoUrl ? (
                <img
                  src={teamLogoUrl}
                  alt={`${teamName} badge`}
                  className="h-full w-full object-contain p-0.5"
                />
              ) : (
                <span className="text-[11px] font-black text-emerald-100">
                  {initials}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
