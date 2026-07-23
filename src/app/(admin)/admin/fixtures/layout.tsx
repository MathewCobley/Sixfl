// ========================================
// File: src/app/(admin)/admin/fixtures/layout.tsx
// ========================================

import type { ReactNode } from "react";

import AdminFixtureCreateNotice from "@/components/admin/fixtures/AdminFixtureCreateNotice";

export default function AdminFixturesLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminFixtureCreateNotice />
      {children}
    </>
  );
}
