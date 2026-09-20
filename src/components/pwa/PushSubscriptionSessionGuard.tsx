"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function PushSubscriptionSessionGuard() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;

    void navigator.serviceWorker.ready
      .then(async (registration) => {
        if (cancelled) return;

        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe().catch(() => false);
        }

        registration.active?.postMessage({
          type: "SIXFL_CLEAR_PUSH_DEVICE_TOKEN",
          token: null,
        });
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [status]);

  return null;
}
