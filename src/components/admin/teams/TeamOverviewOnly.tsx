"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function TeamOverviewOnly({
  teamId,
  children,
}: {
  teamId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const overviewPath = `/admin/teams/${teamId}`;

  if (pathname !== overviewPath && pathname !== `${overviewPath}/`) {
    return null;
  }

  return <div className="space-y-5">{children}</div>;
}
