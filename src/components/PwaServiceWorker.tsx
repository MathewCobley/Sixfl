"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const FOREGROUND_REFRESH_AFTER_MS = 30_000;
const FOREGROUND_REFRESH_THROTTLE_MS = 10_000;

function isInstalledApp() {
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosStandalone
  );
}

function isSafeAutoRefreshRoute(pathname: string) {
  if (pathname === "/dashboard") return true;
  if (pathname === "/referee" || pathname === "/referee/") return true;
  if (/^\/captain\/team\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/player\/team\/[^/]+\/?$/.test(pathname)) return true;
  return false;
}

function hasActiveEditor() {
  const active = document.activeElement;

  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    return true;
  }

  return active instanceof HTMLElement && active.isContentEditable;
}

export default function PwaServiceWorker() {
  const pathname = usePathname();
  const hiddenAtRef = useRef<number | null>(null);
  const lastForegroundCheckRef = useRef(0);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    const register = async () => {
      try {
        if (cancelled) return;
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
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

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!isInstalledApp()) return;

    let cancelled = false;
    let controllerChangeHandled = false;

    const safelyReloadOverview = () => {
      if (cancelled || reloadingRef.current) return false;
      if (document.visibilityState !== "visible") return false;
      if (!isSafeAutoRefreshRoute(pathname)) return false;
      if (hasActiveEditor()) return false;

      reloadingRef.current = true;
      window.location.reload();
      return true;
    };

    const checkOnForeground = async () => {
      if (cancelled || document.visibilityState !== "visible") return;

      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;

      if (hiddenAt === null) return;

      const hiddenForMs = Date.now() - hiddenAt;
      if (hiddenForMs < FOREGROUND_REFRESH_AFTER_MS) return;

      const now = Date.now();
      if (
        now - lastForegroundCheckRef.current <
        FOREGROUND_REFRESH_THROTTLE_MS
      ) {
        return;
      }
      lastForegroundCheckRef.current = now;

      try {
        const activeRegistration =
          await navigator.serviceWorker.getRegistration("/");
        await activeRegistration?.update();
      } catch (error) {
        console.warn("SIXFL app update check failed", error);
      }

      safelyReloadOverview();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      void checkOnForeground();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && hiddenAtRef.current === null) {
        hiddenAtRef.current = Date.now() - FOREGROUND_REFRESH_AFTER_MS;
      }
      void checkOnForeground();
    };

    const onControllerChange = () => {
      if (controllerChangeHandled) return;
      controllerChangeHandled = true;
      safelyReloadOverview();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, [pathname]);

  return null;
}
