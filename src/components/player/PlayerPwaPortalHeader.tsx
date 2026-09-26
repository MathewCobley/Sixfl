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

type PreviewPlayer = {
  id: string;
  name: string | null;
};

export default function PlayerPwaPortalHeader({
  teamId,
  teamName,
  teamLogoUrl,
  playerName,
  previewPlayers = [],
}: {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  playerName: string | null;
  previewPlayers?: PreviewPlayer[];
}) {
  const searchParams = useSearchParams();
  const [appMode, setAppMode] = useState(false);
  const previewMembershipId =
    searchParams.get("previewMembershipId")?.trim() || null;
  const previewPlayerName = previewMembershipId
    ? previewPlayers.find((player) => player.id === previewMembershipId)?.name?.trim() || null
    : null;
  const displayName = previewPlayerName || playerName?.trim() || "SIXFL Player";

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
        body:has(.player-pwa-mode) .player-team-layout main section.sticky.z-50 {
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
        className="player-pwa-portal-header sticky top-0 z-40 border-b border-white/[0.07] bg-[#06110e]/95 px-4 pb-2.5 backdrop-blur-xl"
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.72rem)" }}
      >
        <div className="mx-auto grid w-full max-w-xl grid-cols-[6.2rem_minmax(0,1fr)_2.6rem] items-center gap-2">
          <Image
            src="/logo2.png"
            alt="SIXFL"
            width={180}
            height={48}
            priority
            className="h-6 w-auto max-w-[6.2rem] object-contain object-left"
          />

          <div className="min-w-0 text-center">
            <div className="truncate text-[13px] font-black tracking-tight text-white">
              {displayName}
            </div>
            <div className="mt-0.5 truncate text-[9px] font-semibold text-white/45">
              Player Portal · {teamName}
            </div>
          </div>

          <div className="flex h-9 w-9 shrink-0 items-center justify-center">
            {teamLogoUrl ? (
              <img
                src={teamLogoUrl}
                alt={`${teamName} badge`}
                className="max-h-9 max-w-9 object-contain"
              />
            ) : (
              <UserCircleIcon className="h-7 w-7 text-white/45" />
            )}
          </div>
        </div>
        <span className="sr-only" data-player-header-team-id={teamId}>{teamId}</span>
      </header>
    </>
  );
}
