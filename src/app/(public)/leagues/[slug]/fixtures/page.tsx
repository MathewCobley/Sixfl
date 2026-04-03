// ========================================
// File: src/app/(public)/leagues/[slug]/fixtures/page.tsx
// ========================================

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function LeagueFixturesPublic({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const league = await prisma.league.findUnique({
    where: { slug },
    include: {
      fixtures: {
        where: {
          publishedAt: {
            not: null,
          },
        },
        orderBy: [{ round: "asc" }, { position: "asc" }, { kickoffAt: "asc" }],
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
  });

  if (!league) {
    notFound();
  }

  const rounds = league.fixtures.reduce(
    (acc, fixture) => {
      const roundKey = fixture.round ?? 0;

      if (!acc[roundKey]) {
        acc[roundKey] = [];
      }

      acc[roundKey].push(fixture);
      return acc;
    },
    {} as Record<number, typeof league.fixtures>,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-10">
      <h1 className="text-3xl font-semibold text-white">{league.name} Fixtures</h1>

      {Object.keys(rounds).length === 0 ? (
        <div className="rounded-xl bg-white/5 px-4 py-6 text-white/65">
          Fixtures will appear here once they have been published.
        </div>
      ) : null}

      {Object.entries(rounds).map(([round, fixtures]) => (
        <div key={round} className="space-y-3">
          <h2 className="text-lg font-medium text-white">Week {round}</h2>

          {fixtures.map((fixture) => (
            <div
              key={fixture.id}
              className="flex justify-between rounded-xl bg-white/5 px-4 py-3 text-white/80"
            >
              <span>
                {fixture.homeTeam.name} vs {fixture.awayTeam.name}
              </span>

              <span className="text-sm text-white/50">
                {fixture.pitch ?? "Pitch TBC"} ·{" "}
                {fixture.kickoffAt
                  ? new Date(fixture.kickoffAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "TBC"}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
