// ========================================
// File: src/app/(admin)/admin/layout.tsx
// ========================================

import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/requireAdmin";
import SiteHeader from "@/components/layout/SiteHeader";
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
      <SiteHeader variant="admin" />

      <div className="mx-auto flex w-full max-w-[1800px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-[96px]">
            <AdminSidebar name={name} email={email} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}