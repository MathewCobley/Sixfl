"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function PlayerDashboardOnly({
  teamId,
  children,
}: {
  teamId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return pathname === `/player/team/${teamId}` ? children : null;
}
