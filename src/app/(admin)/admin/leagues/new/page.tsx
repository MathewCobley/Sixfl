// ========================================
// File: src/app/admin/leagues/new/page.tsx
// ========================================

import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import LeagueForm from "@/components/admin/leagues/LeagueForm";
import { createLeagueAction } from "@/app/(admin)/admin/leagues/actions";

export default async function NewLeaguePage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/leagues"
          className="text-sm text-emerald-300 hover:text-emerald-200"
        >
          ← Back to leagues
        </Link>

        <h1 className="text-3xl font-semibold text-white">Create league</h1>

        <p className="text-sm text-white/60">
          Set up a league and give it a proper public landing page.
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 md:p-8">
        <LeagueForm
          mode="create"
          action={createLeagueAction}
          initialValues={{
            isActive: true,
            ctaText: "Register your team",
            format: "6-a-side",
            minutesPerGame: "40",
            costPerTeamPerMatch: "40",
            targetTeamCount: "12",
          }}
        />
      </div>
    </div>
  );
}
