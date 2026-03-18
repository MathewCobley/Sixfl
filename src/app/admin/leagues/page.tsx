// ========================================
// File: src/app/admin/page.tsx
// ========================================

import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function AdminPage() {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl">
        <div className="px-2 pb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-white/40">
            Admin Console
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
            <div className="text-lg font-semibold text-white">
              {user.name ?? "Admin User"}
            </div>
            <div className="mt-1 text-sm text-white/55">
              {user.email ?? "No email address"}
            </div>
          </div>

          <Link
            href="/admin/overview"
            className="block rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white transition hover:border-emerald-400 hover:bg-white/5"
          >
            Overview
          </Link>

          <Link
            href="/admin/teams"
            className="block rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white transition hover:border-emerald-400 hover:bg-white/5"
          >
            Teams
          </Link>

          <Link
            href="/admin/leads"
            className="block rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white transition hover:border-emerald-400 hover:bg-white/5"
          >
            Leads
          </Link>

          <Link
            href="/admin/leagues"
            className="block rounded-2xl border border-white/10 bg-black/40 px-4 py-4 text-white transition hover:border-emerald-400 hover:bg-white/5"
          >
            Leagues
          </Link>
        </div>
      </div>
    </div>
  );
}