// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import type { ReactNode } from "react";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader variant="public" />
      <main className="mx-auto max-w-6xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}