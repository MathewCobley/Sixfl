// ========================================
// File: src/app/captain/team/[teamId]/fixtures/page.tsx
// ========================================

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function CaptainFixturesPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      league: {
        include: {
          matches: {
            orderBy: [{ round: "asc" }, { position: "asc" }],
            include: {
              homeTeam: true,
              awayTeam: true,
            },
          },
        },
      },
    },
  });

  if (!team) return notFound();

  const matches = team.league.matches.filter(
    (m) =>
      m.homeTeamId === teamId || m.awayTeamId === teamId
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-10">
      <h1 className="text-2xl text-white font-semibold">
        Your Fixtures
      </h1>

      {matches.map((m) => (
        <div
          key={m.id}
          className="flex justify-between bg-white/5 rounded-xl px-4 py-3 text-white"
        >
          <span>
            {m.homeTeam.name} vs {m.awayTeam.name}
          </span>

          <span className="text-white/60 text-sm">
            Week {m.round} · {m.pitch} ·{" "}
            {m.kickoffAt
              ? new Date(m.kickoffAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "TBC"}
          </span>
        </div>
      ))}
    </div>
  );
}