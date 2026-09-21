import type { ReactNode } from "react";
import { notFound, permanentRedirect } from "next/navigation";

import FormingLeagueLanding from "@/components/leagues/FormingLeagueLanding";
import LeagueQuickLinks from "@/components/leagues/LeagueQuickLinks";
import { getHomepageLeagues } from "@/lib/leagues/homepage-leagues";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicLeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (slug.toLowerCase().includes("heartlands")) {
    permanentRedirect("/leagues");
  }

  const publicLeague = await prisma.league.findFirst({
    where: {
      slug,
      isActive: true,
      publicAt: { lte: new Date() },
    },
    select: { id: true },
  });

  if (!publicLeague) {
    notFound();
  }

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
