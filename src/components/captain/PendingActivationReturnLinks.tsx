// ========================================
// File: src/components/captain/PendingActivationReturnLinks.tsx
// ========================================

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function PendingActivationReturnLinks() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.endsWith("/squad")) return;
  }, [pathname]);

  return null;
}
