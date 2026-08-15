import type { ReactNode } from "react";

import LeagueQuickLinks from "@/components/leagues/LeagueQuickLinks";

export default async function PublicLeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <>
      <LeagueQuickLinks slug={slug} />
      {children}
    </>
  );
}
