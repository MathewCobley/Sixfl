"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const LAUNCH_STORAGE_KEY = "sixfl:pwa-launch-shown";
const LAUNCH_HOLD_MS = 1600;
const LAUNCH_FADE_MS = 280;

type LaunchPhase = "visible" | "leaving" | "hidden";

function isInstalledApp() {
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosStandalone
  );
}

function getPortalLabel(pathname: string) {
  if (pathname === "/referee" || pathname.startsWith("/referee/")) {
    return "Referee Portal";
  }

  if (pathname.startsWith("/captain/")) {
    return "Captain Portal";
  }

  if (pathname.startsWith("/player/")) {
    return "Player Portal";
  }

  return "SIXFL App";
}

function wasLaunchShown() {
  try {
    return window.sessionStorage.getItem(LAUNCH_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markLaunchShown() {
  try {
    window.sessionStorage.setItem(LAUNCH_STORAGE_KEY, "1");
  } catch {
    // Restricted browser modes can block storage. The splash still works.
  }
}

export default function PwaLaunchScreen() {
  const pathname = usePathname();
  const portalLabel = useMemo(() => getPortalLabel(pathname), [pathname]);
  const [phase, setPhase] = useState<LaunchPhase>("visible");
  const [forcedStandalone, setForcedStandalone] = useState(false);

  useEffect(() => {
    if (!isInstalledApp()) {
      setPhase("hidden");
      return;
    }

    setForcedStandalone(true);

    if (wasLaunchShown()) {
      setPhase("hidden");
      return;
    }

    markLaunchShown();

    const fadeTimer = window.setTimeout(() => {
      setPhase("leaving");
    }, LAUNCH_HOLD_MS);

    const hideTimer = window.setTimeout(() => {
      setPhase("hidden");
    }, LAUNCH_HOLD_MS + LAUNCH_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      aria-hidden="true"
      className={[
        "sixfl-pwa-launch",
        forcedStandalone ? "sixfl-pwa-launch-forced" : "",
        phase === "leaving" ? "sixfl-pwa-launch-leaving" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <style>{`
        .sixfl-pwa-launch {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 1000;
          place-items: center;
          overflow: hidden;
          padding:
            max(2rem, env(safe-area-inset-top))
            1.5rem
            max(2rem, env(safe-area-inset-bottom));
          background:
            radial-gradient(circle at 50% 36%, rgba(30, 220, 125, 0.15), transparent 24rem),
            radial-gradient(circle at 12% 84%, rgba(30, 220, 125, 0.08), transparent 20rem),
            linear-gradient(180deg, #050806 0%, #08100b 48%, #030504 100%);
          opacity: 1;
          transition: opacity ${LAUNCH_FADE_MS}ms ease;
          isolation: isolate;
        }

        @media (display-mode: standalone) {
          .sixfl-pwa-launch {
            display: grid;
          }
        }

        .sixfl-pwa-launch.sixfl-pwa-launch-forced {
          display: grid;
        }

        .sixfl-pwa-launch.sixfl-pwa-launch-leaving {
          opacity: 0;
          pointer-events: none;
        }

        .sixfl-pwa-launch::before,
        .sixfl-pwa-launch::after {
          content: "";
          position: absolute;
          inset: auto;
          pointer-events: none;
          z-index: -1;
        }

        .sixfl-pwa-launch::before {
          left: -18%;
          right: -18%;
          bottom: -10%;
          height: 53%;
          transform: perspective(520px) rotateX(64deg);
          transform-origin: center bottom;
          border-top: 1px solid rgba(89, 255, 164, 0.16);
          background:
            linear-gradient(rgba(75, 255, 153, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(75, 255, 153, 0.08) 1px, transparent 1px);
          background-size: 3.2rem 3.2rem;
          mask-image: linear-gradient(to top, black 8%, rgba(0, 0, 0, 0.6) 48%, transparent 90%);
        }

        .sixfl-pwa-launch::after {
          width: min(76vw, 23rem);
          aspect-ratio: 1;
          border: 1px solid rgba(75, 255, 153, 0.16);
          border-radius: 999px;
          box-shadow:
            0 0 0 2.8rem rgba(75, 255, 153, 0.018),
            0 0 8rem rgba(30, 220, 125, 0.07);
          top: 43%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .sixfl-pwa-launch-content {
          display: flex;
          width: min(100%, 28rem);
          min-height: min(72vh, 40rem);
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .sixfl-pwa-launch-logo-wrap {
          position: relative;
          width: min(76vw, 21rem);
        }

        .sixfl-pwa-launch-logo-wrap::before {
          content: "";
          position: absolute;
          inset: 50% 10% auto;
          height: 3.5rem;
          transform: translateY(-50%);
          border-radius: 999px;
          background: rgba(49, 255, 142, 0.18);
          filter: blur(2.2rem);
        }

        .sixfl-pwa-launch-logo {
          position: relative;
          width: 100%;
          height: auto;
          object-fit: contain;
          filter: drop-shadow(0 0 1.25rem rgba(39, 255, 139, 0.11));
        }

        .sixfl-pwa-launch-tagline {
          margin: 1.2rem 0 0;
          color: rgba(255, 255, 255, 0.82);
          font-size: clamp(0.9rem, 3.5vw, 1.05rem);
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .sixfl-pwa-launch-tagline strong {
          color: #55e993;
          font-weight: 800;
        }

        .sixfl-pwa-launch-role {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1.35rem;
          color: rgba(255, 255, 255, 0.58);
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        .sixfl-pwa-launch-role::before,
        .sixfl-pwa-launch-role::after {
          content: "";
          width: 1.8rem;
          height: 1px;
          background: linear-gradient(90deg, transparent, #4ade80);
        }

        .sixfl-pwa-launch-role::after {
          transform: rotate(180deg);
        }

        .sixfl-pwa-launch-loader {
          width: min(62vw, 15rem);
          height: 2px;
          margin-top: 4rem;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.09);
        }

        .sixfl-pwa-launch-loader > span {
          display: block;
          width: 42%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(74, 222, 128, 0.2), #4ade80, #8fffc0);
          box-shadow: 0 0 1rem rgba(74, 222, 128, 0.75);
          animation: sixfl-launch-progress 0.85s cubic-bezier(0.55, 0.05, 0.2, 1) both;
        }

        .sixfl-pwa-launch-loading {
          margin: 0.85rem 0 0;
          color: rgba(255, 255, 255, 0.38);
          font-size: 0.73rem;
          font-weight: 600;
          letter-spacing: 0.1em;
        }

        @keyframes sixfl-launch-progress {
          from {
            width: 10%;
            opacity: 0.35;
          }
          to {
            width: 100%;
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sixfl-pwa-launch,
          .sixfl-pwa-launch-loader > span {
            transition: none;
            animation: none;
          }

          .sixfl-pwa-launch-loader > span {
            width: 100%;
          }
        }
      `}</style>

      <div className="sixfl-pwa-launch-content">
        <div className="sixfl-pwa-launch-logo-wrap">
          <Image
            src="/logo2.png"
            alt=""
            width={949}
            height={252}
            priority
            className="sixfl-pwa-launch-logo"
          />
        </div>

        <p className="sixfl-pwa-launch-tagline">
          6-a-side football. <strong>Properly run.</strong>
        </p>

        <div className="sixfl-pwa-launch-role">{portalLabel}</div>

        <div className="sixfl-pwa-launch-loader">
          <span />
        </div>
        <p className="sixfl-pwa-launch-loading">Loading your portal…</p>
      </div>
    </div>
  );
}
