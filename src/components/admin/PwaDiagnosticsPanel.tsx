"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import PwaViewerPicker, {
  type PwaViewerData,
} from "@/components/admin/pwa/PwaViewerPicker";

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

type PreviewDevice = {
  id: string;
  label: string;
  width: number;
  height: number;
};

const previewDevices: PreviewDevice[] = [
  { id: "iphone-15-pro", label: "iPhone 15 Pro", width: 393, height: 852 },
  { id: "iphone-15-pro-max", label: "iPhone 15 Pro Max", width: 430, height: 932 },
  { id: "iphone-se", label: "iPhone SE", width: 375, height: 667 },
  { id: "pixel-8", label: "Pixel 8", width: 412, height: 915 },
];

const previewRoutes = [
  { label: "App launch", path: "/dashboard?app=1" },
  { label: "Public site", path: "/" },
  { label: "Admin website", path: "/admin" },
  { label: "Install page", path: "/install" },
];

function normalisePreviewPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

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
  const extendedNavigator = navigator as Navigator & {
    standalone?: boolean;
    userAgentData?: { platform?: string };
  };
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in extendedNavigator &&
    Boolean(extendedNavigator.standalone);

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
      extendedNavigator.userAgentData?.platform ??
      navigator.platform ??
      "Unknown",
    online: navigator.onLine,
  };
}

export default function PwaDiagnosticsPanel({
  viewerData,
}: {
  viewerData: PwaViewerData;
}) {
  const [state, setState] = useState<DiagnosticsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [previewDeviceId, setPreviewDeviceId] = useState(previewDevices[0].id);
  const [previewPath, setPreviewPath] = useState("/dashboard?app=1");
  const [previewInput, setPreviewInput] = useState("/dashboard?app=1");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const previewDevice =
    previewDevices.find((device) => device.id === previewDeviceId) ??
    previewDevices[0];

  function loadPreviewPath(value: string) {
    const nextPath = normalisePreviewPath(value);
    if (!nextPath) {
      setPreviewError("Enter a SIXFL route such as /admin, /dashboard or /captain/team/...");
      return;
    }

    setPreviewError(null);
    setPreviewPath(nextPath);
    setPreviewInput(nextPath);
    setPreviewKey((value) => value + 1);
  }

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
          tone:
            state.manifest.startUrl === "/dashboard?app=1"
              ? "good"
              : "neutral",
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
      <PwaViewerPicker data={viewerData} onPreview={loadPreviewPath} />

      <section className="rounded-3xl border border-emerald-400/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_36%),rgba(255,255,255,0.03)] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.3)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/75">
              Admin app tools
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              PWA diagnostics
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
              Technical checks for the installed web app. For day-to-day portal testing, use the Viewer Picker above and the phone preview below.
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
          These are admin-only shortcuts while the app is still being developed.
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


      <section className="rounded-3xl border border-sky-400/15 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.11),transparent_38%),rgba(255,255,255,0.03)] p-5 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/65">
              Desktop testing
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Phone preview</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Load the real SIXFL site inside a phone-sized viewport using your current login. This is ideal for checking responsive layout from the PC. It approximates the screen size and app chrome, but it does not emulate Apple&apos;s Safari engine or genuine iPhone standalone APIs.
            </p>
          </div>

          <a
            href={previewPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Open current route in new tab
          </a>
        </div>

        <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
          <div className="min-w-0 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                Device size
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {previewDevices.map((device) => {
                  const active = device.id === previewDevice.id;
                  return (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => {
                        setPreviewDeviceId(device.id);
                        setPreviewKey((value) => value + 1);
                      }}
                      className={[
                        "min-h-11 rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                        active
                          ? "border-sky-300/35 bg-sky-400/15 text-sky-100"
                          : "border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.05] hover:text-white",
                      ].join(" ")}
                    >
                      {device.label}
                      <span className="ml-2 text-xs font-normal opacity-55">
                        {device.width} × {device.height}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
                Quick routes
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {previewRoutes.map((route) => (
                  <button
                    key={route.path}
                    type="button"
                    onClick={() => loadPreviewPath(route.path)}
                    className={[
                      "min-h-10 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                      previewPath === route.path
                        ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-100"
                        : "border-white/10 bg-black/20 text-white/60 hover:bg-white/[0.05] hover:text-white",
                    ].join(" ")}
                  >
                    {route.label}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                loadPreviewPath(previewInput);
              }}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <label
                htmlFor="pwa-preview-route"
                className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40"
              >
                Any SIXFL route
              </label>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  id="pwa-preview-route"
                  value={previewInput}
                  onChange={(event) => setPreviewInput(event.target.value)}
                  placeholder="/captain/team/..."
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-base text-white outline-none placeholder:text-white/25 focus:border-sky-400/50"
                />
                <button
                  type="submit"
                  className="min-h-11 rounded-xl bg-sky-500 px-4 text-sm font-bold text-black transition hover:bg-sky-400"
                >
                  Load route
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewKey((value) => value + 1)}
                  className="min-h-11 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  Reload
                </button>
              </div>
              {previewError ? (
                <p className="mt-2 text-sm text-amber-200">{previewError}</p>
              ) : (
                <p className="mt-2 text-xs leading-5 text-white/35">
                  You can paste a SIXFL path or a full sixfl.co.uk URL. External sites are blocked.
                </p>
              )}
            </form>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/55">
              <span className="font-semibold text-white/75">Current preview:</span>{" "}
              {previewPath} · {previewDevice.label} · {previewDevice.width} × {previewDevice.height}px
            </div>
          </div>

          <div className="min-w-0 overflow-x-auto pb-2">
            <div
              className="mx-auto overflow-hidden rounded-[2.7rem] border-[10px] border-[#171717] bg-black shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
              style={{ width: previewDevice.width }}
            >
              <div
                aria-hidden="true"
                className="flex h-11 items-center justify-between bg-[#080b0f] px-7 text-[12px] font-semibold text-white"
              >
                <span>9:41</span>
                <span className="tracking-[0.12em] text-white/85">●●● )))</span>
              </div>
              <iframe
                key={`${previewPath}-${previewDevice.id}-${previewKey}`}
                src={previewPath}
                title={`SIXFL phone preview: ${previewPath}`}
                className="block w-full border-0 bg-black"
                style={{ height: Math.max(400, previewDevice.height - 44) }}
              />
            </div>
          </div>
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
