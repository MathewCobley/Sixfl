// src/app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";

import TeamKitColourAdminBridge from "@/components/admin/teams/TeamKitColourAdminBridge";
import FixtureKitShirtsBridge from "@/components/fixtures/FixtureKitShirtsBridge";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TeamKitColourAdminBridge />
      <FixtureKitShirtsBridge />
      {children}
    </SessionProvider>
  );
}
