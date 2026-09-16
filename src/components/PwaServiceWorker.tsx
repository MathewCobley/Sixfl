"use client";

import { useEffect } from "react";

export default function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        if (cancelled) return;
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.warn("SIXFL service worker registration failed", error);
      }
    };

    if (document.readyState === "complete") {
      void register();
      return () => {
        cancelled = true;
      };
    }

    const onLoad = () => void register();
    window.addEventListener("load", onLoad, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
