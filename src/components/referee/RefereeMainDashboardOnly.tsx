"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function RefereeMainDashboardOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname !== "/referee") return null;
  return <>{children}</>;
}
