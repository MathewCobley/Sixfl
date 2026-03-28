// ========================================
// File: src/app/admin/leagues/[id]/fixtures/page.tsx
// ========================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import FixturesEditor from "@/components/admin/fixtures/FixturesEditor";

// ========================================
// Page
// ========================================

export default async function LeagueFixturesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;

  // ========================================
  // Fetch league + fixtures
  // ========================================

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: {
        orderBy: { name: "asc" },
      },
      matches: {
        orderBy: [{ round: "asc" }, { position: "asc" }],
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
  });

  if (!league) return notFound();

  const hasFixtures = league.matches.length > 0;

  // ========================================
  // Render
  // ========================================

  return (
    <div className="mx-auto max-w-7xl space-y-8">

      {/* ========================================
          Header
      ======================================== */}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-white">
            Fixtures — {league.name}
          </h1>
          <p className="text-white/60 text-sm">
            Manage scheduling, kickoff times and pitches
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Back */}
          <Link
            href="/admin/leagues"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            Back to leagues
          </Link>

          {/* Public view */}
          {league.slug && (
            <Link
              href={`/leagues/${league.slug}/fixtures`}
              target="_blank"
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 transition"
            >
              View public
            </Link>
          )}
        </div>
      </div>

      {/* ========================================
          Empty state
      ======================================== */}

      {!hasFixtures && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center space-y-3">
          <p className="text-white/70">
            No fixtures have been generated yet.
          </p>
          <p className="text-sm text-white/50">
            Click “Regenerate Fixtures” to create your schedule.
          </p>
        </div>
      )}

      {/* ========================================
          Fixtures Editor
      ======================================== */}

      <FixturesEditor
        leagueId={league.id}
        teams={league.teams}
        matches={league.matches}
      />
    </div>
  );
}