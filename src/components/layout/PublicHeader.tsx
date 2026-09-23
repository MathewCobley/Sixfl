"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import AppHeader from "@/components/layout/AppHeader";

function isRefereeAppFrame() {
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

export default function PublicHeader() {
  const pathname = usePathname();
  const isRefereeRoute =
    pathname === "/referee" || pathname.startsWith("/referee/");
  const [refereeAppMode, setRefereeAppMode] = useState(false);

  useEffect(() => {
    if (!isRefereeRoute) {
      setRefereeAppMode(false);
      return;
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    const explicitPreview = new URLSearchParams(window.location.search).get("pwaPreview") === "1";
    setRefereeAppMode(
      explicitPreview || standalone || iosStandalone || isRefereeAppFrame(),
    );
  }, [isRefereeRoute]);

  if (isRefereeRoute && refereeAppMode) return null;

  return <AppHeader variant="public" />;
}
