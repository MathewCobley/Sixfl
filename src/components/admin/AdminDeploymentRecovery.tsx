"use client";

import { useEffect } from "react";

const RELOAD_GUARD_KEY = "sixfl:admin:stale-deployment-reload";
const RELOAD_GUARD_MS = 45_000;

function errorText(value: unknown, depth = 0): string {
  if (depth > 2 || value == null) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    return [value.name, value.message, value.stack].filter(Boolean).join(" ");
  }
  if (typeof value !== "object") return String(value);

  const row = value as Record<string, unknown>;
  return ["message", "reason", "error", "digest"]
    .map((key) => errorText(row[key], depth + 1))
    .filter(Boolean)
    .join(" ");
}

export function isStaleAdminDeploymentError(value: unknown) {
  const message = errorText(value);
  return (
    /failed to find server action/i.test(message) ||
    /older or newer deployment/i.test(message) ||
    /server action.{0,80}(?:not found|does not exist|unknown)/i.test(message)
  );
}

export function reloadAdminForStaleDeployment() {
  if (typeof window === "undefined") return false;

  const now = Date.now();
  const page = `${window.location.pathname}${window.location.search}`;
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    const previous = raw ? (JSON.parse(raw) as { at?: number; page?: string }) : null;
    if (
      previous?.page === page &&
      typeof previous.at === "number" &&
      now - previous.at < RELOAD_GUARD_MS
    ) {
      return false;
    }

    window.sessionStorage.setItem(
      RELOAD_GUARD_KEY,
      JSON.stringify({ at: now, page }),
    );
  } catch {
    // Storage can be unavailable in strict/private browser modes. Reload once anyway.
  }

  window.location.reload();
  return true;
}

export default function AdminDeploymentRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!isStaleAdminDeploymentError(event.error ?? event.message)) return;
      event.preventDefault();
      reloadAdminForStaleDeployment();
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isStaleAdminDeploymentError(event.reason)) return;
      event.preventDefault();
      reloadAdminForStaleDeployment();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
