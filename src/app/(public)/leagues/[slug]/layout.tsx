import type { ReactNode } from "react";

import FormingLeagueLanding from "@/components/leagues/FormingLeagueLanding";
import LeagueQuickLinks from "@/components/leagues/LeagueQuickLinks";
import { getHomepageLeagues } from "@/lib/leagues/homepage-leagues";

export default async function PublicLeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const homepageLeagues = await getHomepageLeagues({ includeHidden: true });
  const homepageLeague = homepageLeagues.find((league) => league.slug === slug);
  const isPreLaunch =
    homepageLeague?.homepageStage === "FORMING" ||
    homepageLeague?.homepageStage === "PLANNED";

  if (isPreLaunch) {
    return <FormingLeagueLanding slug={slug} />;
  }

  return (
    <>
      <LeagueQuickLinks slug={slug} />
      {children}
    </>
  );
}
