// ========================================
// File: src/app/admin/layout.tsx
// ========================================

import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, user } = await requireAdmin();

  const email = user?.email ?? session?.user?.email ?? "Admin";
  const name = user?.name ?? session?.user?.name ?? "Admin";

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] font-bold tracking-[0.2em] text-white/45">
              ADMIN CONSOLE
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="text-sm font-semibold text-white">{name}</div>
              <div className="mt-1 text-xs text-white/50">{email}</div>
            </div>

            <nav className="mt-4 grid gap-2">
              <Link
                href="/admin"
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:bg-black/30 hover:text-white"
              >
                Overview
              </Link>

              <Link
                href="/admin/teams"
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:bg-black/30 hover:text-white"
              >
                Teams
              </Link>

              <Link
                href="/admin/leads"
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80 transition hover:bg-black/30 hover:text-white"
              >
                Leads
              </Link>
            </nav>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}