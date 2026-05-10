// ========================================
// File: src/app/(public)/layout.tsx
// ========================================

import type { ReactNode } from "react";
import AppHeader from "@/components/layout/AppHeader";
import PublicLeagueLandingSpacingBridge from "@/components/layout/PublicLeagueLandingSpacingBridge";
import SiteFooter from "@/components/layout/SiteFooter";

export default function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader variant="public" />
      <PublicLeagueLandingSpacingBridge />
      <main className="mx-auto max-w-6xl px-4 pb-8 pt-0">{children}</main>
      <SiteFooter />
    </>
  );
}