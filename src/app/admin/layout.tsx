// ========================================
// File: src/app/admin/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import AdminSidebar from "@/components/admin/AdminSidebar";

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
          <AdminSidebar name={name} email={email} />
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}