"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export default function AuthenticatedReturnVisitTracker() {
  const { status } = useSession();
  const sentRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || sentRef.current) return;
    sentRef.current = true;

    void fetch("/api/auth/return-visit", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
  }, [status]);

  return null;
}
