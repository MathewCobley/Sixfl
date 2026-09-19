"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type CheckTone = "good" | "warn" | "neutral";

type CheckRow = {
  label: string;
  value: string;
  detail?: string;
  tone: CheckTone;
};

type ManifestSummary = {
  ok: boolean;
  name?: string;
  shortName?: string;
  startUrl?: string;
  display?: string;
  scope?: string;
  themeColor?: string;
  iconCount?: number;
  error?: string;
};

type ServiceWorkerSummary = {
  supported: boolean;
  registered: boolean;
  controlled: boolean;
  scriptUrl?: string;
  activeState?: string;
  installingState?: string;
  waitingState?: string;
  error?: string;
};

type DiagnosticsState = {
  standalone: boolean;
  iosStandalone: boolean;
  serviceWorker: ServiceWorkerSummary;
  manifest: ManifestSummary;
  pushSupported: boolean;
  notificationsSupported: boolean;
  notificationPermission: string;
  userAgent: string;
  platform: string;
  online: boolean;
};

function toneClasses(tone: CheckTone) {
  if (tone === "good") {
    return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  }
  if (tone === "warn") {
    return "border-amber-400/20 bg-amber-500/10 text-amber-100";
  }
  return "border-white/10 bg-white/[0.04] text-white/75";
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

async function readManifest(): Promise<ManifestSummary> {
  try {
    const response = await fetch("/manifest.webmanifest", {
      cache: "no-store",
      headers: { Accept: "application/manifest+json, application/json" },
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Manifest returned HTTP ${response.status}`,
      };
    }

    const manifest = (await response.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      scope?: string;
      theme_color?: string;
      icons?: unknown[];
    };

    return {
      ok: true,
      name: manifest.name,
      shortName: manifest.short_name,
      startUrl: manifest.start_url,
      display: manifest.display,
      scope: manifest.scope,
      themeColor: manifest.theme_color,
      iconCount: Array.isArray(manifest.icons) ? manifest.icons.length : 0,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not read manifest",
    };
  }
}

async function readServiceWorker(): Promise<ServiceWorkerSummary> {
  if (!("serviceWorker" in navigator)) {
    return {
      supported: false,
      registered: false,
      controlled: false,
    };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/");

    return {
      supported: true,
      registered: Boolean(registration),
      controlled: Boolean(navigator.serviceWorker.controller),
      scriptUrl:
        registration?.active?.scriptURL ??
        registration?.waiting?.scriptURL ??
        registration?.installing?.scriptURL,
      activeState: registration?.active?.state,
      waitingState: registration?.waiting?.state,
      installingState: registration?.installing?.state,
    };
  } catch (error) {
    return {
      supported: true,
      registered: false,
      controlled: Boolean(navigator.serviceWorker.controller),
      error: error instanceof Error ? error.message : "Could not inspect service worker",
    };
  }
}

async function collectDiagnostics(): Promise<DiagnosticsState> {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  const [manifest, serviceWorker] = await Promise.all([
    readManifest(),
    readServiceWorker(),
  ]);

  return {
    standalone,
    iosStandalone,
    serviceWorker,
    manifest,
    pushSupported: "PushManager" in window && "serviceWorker" in navigator,
    notificationsSupported: "Notification" in window,
    notificationPermission:
      "Notification" in window ? Notification.permission : "unsupported",
    userAgent: navigator.userAgent,
    platform:
      navigator.userAgentData?.platform ??
      navigator.platform ??
      "Unknown",
    online: navigator.onLine,
  };
}

export default function PwaDiagnosticsPanel() {
  const [state, setState] = useState<DiagnosticsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setUpdateMessage(null);
    const next = await collectDiagnostics();
    setState(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function updateServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      setUpdateMessage("Service workers are not supported in this browser.");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        setUpdateMessage("No SIXFL service worker registration was found.");
        return;
      }

      await registration.update();
      setUpdateMessage("Service worker update check completed.");
      await refresh();
    } catch (error) {
      setUpdateMessage(
        error instanceof Error
          ? `Update check failed: ${error.message}`
          : "Service worker update check failed.",
      );
    }
  }

  const rows: CheckRow[] = state
    ? [
        {
          label: "Installed / standalone mode",
          value: yesNo(state.standalone || state.iosStandalone),
          detail:
            state.standalone || state.iosStandalone
              ? "SIXFL is currently running as an installed app."
              : "This page is currently running in a normal browser tab.",
          tone: state.standalone || state.iosStandalone ? "good" : "neutral",
        },
        {
          label: "Service worker support",
          value: yesNo(state.serviceWorker.supported),
          detail: state.serviceWorker.error,
          tone: state.serviceWorker.supported ? "good" : "warn",
        },
        {
          label: "Service worker registered",
          value: yesNo(state.serviceWorker.registered),
          detail: state.serviceWorker.scriptUrl,
          tone: state.serviceWorker.registered ? "good" : "warn",
        },
        {
          label: "This page controlled by service worker",
          value: yesNo(state.serviceWorker.controlled),
          detail: state.serviceWorker.activeState
            ? `Active state: ${state.serviceWorker.activeState}`
            : undefined,
          tone: state.serviceWorker.controlled ? "good" : "neutral",
        },
        {
          label: "Manifest available",
          value: yesNo(state.manifest.ok),
          detail: state.manifest.error,
          tone: state.manifest.ok ? "good" : "warn",
        },
        {
          label: "Manifest launch route",
          value: state.manifest.startUrl ?? "Not reported",
          detail: state.manifest.display
            ? `Display: ${state.manifest.display} · Scope: ${state.manifest.scope ?? "not reported"}`
            : undefined,
          tone: state.manifest.startUrl === "/dashboard" ? "good" : "neutral",
        },
        {
          label: "Push supported",
          value: yesNo(state.pushSupported),
          detail:
            "This only checks browser/device capability. SIXFL push subscriptions are not built yet.",
          tone: state.pushSupported ? "good" : "neutral",
        },
        {
          label: "Notification permission",
          value: state.notificationPermission,
          detail: state.notificationsSupported
            ? "Permission is device/browser-specific."
            : "Notifications are not supported in this browser.",
          tone:
            state.notificationPermission === "granted"
              ? "good"
              : state.notificationPermission === "denied"
                ? "warn"
                : "neutral",
        },
        {
          label: "Online",
          value: yesNo(state.online),
          tone: state.online ? "good" : "warn",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_36%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
              Hidden admin test area
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              PWA diagnostics
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Check whether the SIXFL web app, service worker and install plumbing are working on this exact device. This page is not linked from the public site or admin navigation.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {loading ? "Checking..." : "Refresh diagnostics"}
            </button>
            <button
              type="button"
              onClick={() => void updateServiceWorker()}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Check for app update
            </button>
          </div>
        </div>

        {updateMessage ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
            {updateMessage}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading && !state ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
            Reading this device...
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.label}
              className={`rounded-2xl border p-5 ${toneClasses(row.tone)}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-65">
                {row.label}
              </div>
              <div className="mt-3 break-words text-xl font-semibold">
                {row.value}
              </div>
              {row.detail ? (
                <div className="mt-2 break-words text-sm leading-6 opacity-70">
                  {row.detail}
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>

      {state?.manifest.ok ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold text-white">Manifest details</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-white/40">Name</dt>
              <dd className="mt-1 text-white/80">{state.manifest.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Short name</dt>
              <dd className="mt-1 text-white/80">{state.manifest.shortName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Icons</dt>
              <dd className="mt-1 text-white/80">{state.manifest.iconCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-white/40">Theme</dt>
              <dd className="mt-1 text-white/80">{state.manifest.themeColor ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-white/40">Service worker active</dt>
              <dd className="mt-1 text-white/80">
                {state.serviceWorker.activeState ?? "Not active"}
              </dd>
            </div>
            <div>
              <dt className="text-white/40">Platform</dt>
              <dd className="mt-1 text-white/80">{state.platform}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-semibold text-white">Test shortcuts</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">
          These are deliberately only on this hidden admin page while the app is still being developed.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/install"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Open install instructions
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
          >
            Test app launch route
          </Link>
        </div>
      </section>

      {state ? (
        <details className="rounded-3xl border border-white/10 bg-black/20 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/75">
            Device/browser detail
          </summary>
          <div className="mt-4 break-words text-xs leading-6 text-white/45">
            {state.userAgent}
          </div>
        </details>
      ) : null}
    </div>
  );
}
