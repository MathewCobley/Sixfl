// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import type { ReactNode } from "react";
import AppHeader from "@/components/layout/AppHeader";
import SiteFooter from "@/components/layout/SiteFooter";

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader variant="public" />
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-8">{children}</main>
      <SiteFooter />
    </>
  );
}