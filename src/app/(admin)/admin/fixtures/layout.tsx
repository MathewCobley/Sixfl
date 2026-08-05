// ========================================
// File: src/app/(admin)/admin/fixtures/layout.tsx
// ========================================

import type { ReactNode } from "react";

import AdminFixtureCreateNotice from "@/components/admin/fixtures/AdminFixtureCreateNotice";
import AdminFixturePlanningNav from "@/components/admin/fixtures/AdminFixturePlanningNav";

export default function AdminFixturesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminFixtureCreateNotice />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:px-8">
        <AdminFixturePlanningNav />
      </div>
      {children}
    </>
  );
}
