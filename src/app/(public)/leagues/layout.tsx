import type { ReactNode } from "react";

import PublicLeagueAdvertVideo from "@/components/leagues/PublicLeagueAdvertVideo";

export default function PublicLeaguesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <PublicLeagueAdvertVideo />
    </>
  );
}
