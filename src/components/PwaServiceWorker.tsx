"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const FOREGROUND_REFRESH_AFTER_MS = 30_000;
const FOREGROUND_REFRESH_THROTTLE_MS = 10_000;
const VERSION_STORAGE_KEY = "sixfl:pwa-version";
const PENDING_VERSION_STORAGE_KEY = "sixfl:pwa-pending-version";

type VersionPayload = {
  version?: string | null;
};

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

function readStoredVersion(key: string) {
  try {
    return window.localStorage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

function writeStoredVersion(key: string, version: string | null) {
  try {
    if (version) {
      window.localStorage.setItem(key, version);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in restricted browser modes.
  }
}

async function fetchDeploymentVersion() {
  try {
    const response = await fetch(`/api/pwa/version?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as VersionPayload;
    return payload.version?.trim() || null;
  } catch {
    return null;
  }
}

export default function PwaServiceWorker() {
  const pathname = usePathname();
  const router = useRouter();
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

    const canRefreshNow = () =>
      !cancelled &&
      !reloadingRef.current &&
      document.visibilityState === "visible" &&
      isSafeAutoRefreshRoute(pathname) &&
      !hasActiveEditor();

    const applyVersionAndReload = (version: string | null) => {
      if (!canRefreshNow()) return false;

      if (version) {
        writeStoredVersion(VERSION_STORAGE_KEY, version);
      }
      writeStoredVersion(PENDING_VERSION_STORAGE_KEY, null);

      reloadingRef.current = true;
      window.location.reload();
      return true;
    };

    const applyPendingVersionIfSafe = () => {
      const pendingVersion = readStoredVersion(PENDING_VERSION_STORAGE_KEY);
      if (!pendingVersion) return false;

      return applyVersionAndReload(pendingVersion);
    };

    const checkVersionAndRefresh = async ({
      refreshDataWhenCurrent,
      fallbackReloadWhenUnknown,
    }: {
      refreshDataWhenCurrent: boolean;
      fallbackReloadWhenUnknown: boolean;
    }) => {
      if (cancelled || document.visibilityState !== "visible") return;

      try {
        const activeRegistration =
          await navigator.serviceWorker.getRegistration("/");
        await activeRegistration?.update();
      } catch (error) {
        console.warn("SIXFL app service-worker update check failed", error);
      }

      const deploymentVersion = await fetchDeploymentVersion();
      if (cancelled) return;

      const storedVersion = readStoredVersion(VERSION_STORAGE_KEY);

      if (!deploymentVersion) {
        if (fallbackReloadWhenUnknown) {
          applyVersionAndReload(null);
        } else if (refreshDataWhenCurrent && canRefreshNow()) {
          router.refresh();
        }
        return;
      }

      if (!storedVersion) {
        writeStoredVersion(VERSION_STORAGE_KEY, deploymentVersion);
        writeStoredVersion(PENDING_VERSION_STORAGE_KEY, null);

        if (refreshDataWhenCurrent && canRefreshNow()) {
          router.refresh();
        }
        return;
      }

      if (deploymentVersion !== storedVersion) {
        writeStoredVersion(PENDING_VERSION_STORAGE_KEY, deploymentVersion);

        if (applyVersionAndReload(deploymentVersion)) {
          return;
        }

        return;
      }

      writeStoredVersion(PENDING_VERSION_STORAGE_KEY, null);

      if (refreshDataWhenCurrent && canRefreshNow()) {
        router.refresh();
      }
    };

    if (applyPendingVersionIfSafe()) {
      return;
    }

    void (async () => {
      const deploymentVersion = await fetchDeploymentVersion();
      if (cancelled || !deploymentVersion) return;

      const storedVersion = readStoredVersion(VERSION_STORAGE_KEY);
      if (!storedVersion) {
        writeStoredVersion(VERSION_STORAGE_KEY, deploymentVersion);
        return;
      }

      if (storedVersion !== deploymentVersion) {
        writeStoredVersion(PENDING_VERSION_STORAGE_KEY, deploymentVersion);
        applyPendingVersionIfSafe();
      }
    })();

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

      await checkVersionAndRefresh({
        refreshDataWhenCurrent: true,
        fallbackReloadWhenUnknown: true,
      });
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

      void checkVersionAndRefresh({
        refreshDataWhenCurrent: false,
        fallbackReloadWhenUnknown: true,
      });
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
  }, [pathname, router]);

  return null;
}
