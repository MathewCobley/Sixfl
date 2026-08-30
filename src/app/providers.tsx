// src/app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";

import AuthenticatedReturnVisitTracker from "@/components/auth/AuthenticatedReturnVisitTracker";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthenticatedReturnVisitTracker />
      {children}
    </SessionProvider>
  );
}
