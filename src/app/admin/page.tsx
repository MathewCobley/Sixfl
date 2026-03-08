// ========================================
// File: src/app/admin/page.tsx
// ========================================

import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminCard from "@/components/admin/AdminCard";

export default async function AdminHome() {
  await requireAdmin();

  return (
    <AdminCard title="Admin Console">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

        <Link
          className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
          href="/admin/teams"
        >
          <div className="font-medium">Teams</div>
          <div className="mt-1 text-sm text-white/70">
            Add and manage teams.
          </div>
        </Link>

        <Link
          className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
          href="/admin/leagues"
        >
          <div className="font-medium">Leagues</div>
          <div className="mt-1 text-sm text-white/70">
            Create and manage leagues.
          </div>
        </Link>

        <Link
          className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-black/30"
          href="/admin/fixtures"
        >
          <div className="font-medium">Fixtures</div>
          <div className="mt-1 text-sm text-white/70">
            Schedule matches and assign referees.
          </div>
        </Link>

        <div className="rounded-xl border border-white/10 bg-black/10 p-4 text-white/60">
          Venues (next)
        </div>

      </div>
    </AdminCard>
  );
}