// ========================================
// File: src/captain/team/[teamId]/fixtures/page.tsx
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
          fixtures: {
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

  if (!team || !team.league) return notFound();

  const matches = team.league.fixtures.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-10">
      <h1 className="text-2xl font-semibold text-white">Your Fixtures</h1>

      {matches.map((m) => (
        <div
          key={m.id}
          className="flex justify-between rounded-xl bg-white/5 px-4 py-3 text-white"
        >
          <span>
            {m.homeTeam.name} vs {m.awayTeam.name}
          </span>

          <span className="text-sm text-white/60">
            Week {m.round} · {m.pitch} ·{" "}
            {new Date(m.kickoffAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}