"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function PlayerDashboardExtras({
  teamId,
  children,
}: {
  teamId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const dashboardPath = `/player/team/${teamId}`;

  if (pathname !== dashboardPath && pathname !== `${dashboardPath}/`) {
    return null;
  }

  return <div className="space-y-8 pb-8">{children}</div>;
}
