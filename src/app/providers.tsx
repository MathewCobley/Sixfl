// src/app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";

import AuthenticatedReturnVisitTracker from "@/components/auth/AuthenticatedReturnVisitTracker";
import PwaServiceWorker from "@/components/PwaServiceWorker";
import PushSubscriptionSessionGuard from "@/components/pwa/PushSubscriptionSessionGuard";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AuthenticatedReturnVisitTracker />
      <PwaServiceWorker />
      <PushSubscriptionSessionGuard />
      {children}
    </SessionProvider>
  );
}
