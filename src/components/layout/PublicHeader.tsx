"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const isRefereeRoute =
    pathname === "/referee" || pathname.startsWith("/referee/");
  const explicitPreview = searchParams.get("pwaPreview") === "1";
  const [refereeAppMode, setRefereeAppMode] = useState(explicitPreview);

  useEffect(() => {
    if (!isRefereeRoute) {
      setRefereeAppMode(false);
      return;
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone =
      "standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    setRefereeAppMode(
      explicitPreview || standalone || iosStandalone || isRefereeAppFrame(),
    );
  }, [explicitPreview, isRefereeRoute]);

  if (isRefereeRoute && refereeAppMode) return null;

  return <AppHeader variant="public" />;
}
