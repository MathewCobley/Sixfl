// ========================================
// File: src/app/admin/leagues/page.tsx
// ========================================

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import LeagueForm from "@/components/admin/leagues/LeagueForm";
import { createLeagueAction } from "@/app/(admin)/admin/leagues/actions";

export default async function AdminLeaguesPage() {
  await requireAdmin();

  const leagues = await prisma.league.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Leagues</h1>
        <p className="text-sm text-white/60">
          Create and manage your leagues.
        </p>
      </div>

      {/* Existing leagues */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Existing leagues
        </h2>

        <div className="space-y-3">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/admin/leagues/${league.id}`}
              className="block rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white/80 hover:bg-black/30 hover:text-white"
            >
              {league.name}
            </Link>
          ))}

          {leagues.length === 0 && (
            <p className="text-sm text-white/50">
              No leagues yet.
            </p>
          )}
        </div>
      </div>

      {/* Create league */}
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Create new league
        </h2>

        <LeagueForm
          mode="create"
          action={createLeagueAction}
          initialValues={{
            isActive: true,
            ctaText: "Register your team",
            format: "6-a-side",
          }}
        />
      </div>
    </div>
  );
}