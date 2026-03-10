// ========================================
// File: src/app/admin/layout.tsx
// ========================================

import Link from "next/link";
import { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { session, user } = await requireAdmin();

  const email = user?.email ?? session.user?.email ?? "Admin";
  const name = user?.name ?? session.user?.name ?? "Admin";

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <Link
              href="/admin"
              className="text-lg font-black tracking-tight text-white"
            >
              SIXFL Admin
            </Link>

            <div className="mt-1 text-sm text-white/70">
              Signed in as{" "}
              <span className="font-medium text-white">{email}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-white">{name}</div>
              <div className="text-xs text-white/50">Administrator</div>
            </div>

            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}