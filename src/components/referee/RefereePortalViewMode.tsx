"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type RefereeViewMode = "app" | "web";

function isAdminPhonePreviewFrame() {
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

function detectAppMode(explicitPreview: boolean) {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return standalone || iosStandalone || explicitPreview || isAdminPhonePreviewFrame();
}

export default function RefereePortalViewMode({
  mode,
  children,
}: {
  mode: RefereeViewMode;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const explicitPreview = searchParams.get("pwaPreview") === "1";
  const [resolvedMode, setResolvedMode] = useState<RefereeViewMode | null>(
    explicitPreview ? "app" : null,
  );

  useEffect(() => {
    setResolvedMode(detectAppMode(explicitPreview) ? "app" : "web");
  }, [explicitPreview]);

  if (resolvedMode === null) {
    return mode === "app" ? (
      <div className="min-h-[12rem] bg-[#07130f]" aria-hidden="true" />
    ) : null;
  }

  return resolvedMode === mode ? <>{children}</> : null;
}
