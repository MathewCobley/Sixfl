"use client";

import { useEffect, useState } from "react";
import { BellAlertIcon, BellSlashIcon } from "@heroicons/react/24/outline";

type PushState =
  | "checking"
  | "unsupported"
  | "off"
  | "enabling"
  | "on"
  | "disabling"
  | "denied"
  | "error";

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  return bytes;
}

function sendDeviceTokenToWorker(token: string | null) {
  return navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage({
      type: token ? "SIXFL_PUSH_DEVICE_TOKEN" : "SIXFL_CLEAR_PUSH_DEVICE_TOKEN",
      token,
    });
  });
}

export default function PushNotificationControl() {
  const [state, setState] = useState<PushState>("checking");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setState(subscription ? "on" : "off");
      })
      .catch(() => setState("off"));
  }, []);

  async function enableNotifications() {
    setState("enabling");
    setFeedback(null);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const configResponse = await fetch("/api/push/subscription", {
        cache: "no-store",
      });
      const config = (await configResponse.json().catch(() => null)) as
        | { publicKey?: string; error?: string }
        | null;

      if (!configResponse.ok || !config?.publicKey) {
        throw new Error(config?.error || "Push notifications are not ready.");
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(config.publicKey),
        });
      }

      const saveResponse = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const saved = (await saveResponse.json().catch(() => null)) as
        | { ok?: boolean; deviceToken?: string; error?: string }
        | null;

      if (!saveResponse.ok || !saved?.deviceToken) {
        throw new Error(saved?.error || "Could not save this device.");
      }

      await sendDeviceTokenToWorker(saved.deviceToken);
      setState("on");
      setFeedback("Notifications are on for private and important messages.");
    } catch (error) {
      setState("error");
      setFeedback(
        error instanceof Error ? error.message : "Could not enable notifications.",
      );
    }
  }

  async function disableNotifications() {
    setState("disabling");
    setFeedback(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => null);

        await subscription.unsubscribe();
      }

      await sendDeviceTokenToWorker(null);
      setState("off");
      setFeedback("Phone notifications are off. Messages still appear in SIXFL.");
    } catch {
      setState("error");
      setFeedback("Could not change notification settings on this device.");
    }
  }

  if (state === "unsupported") return null;

  if (state === "on") {
    return (
      <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <BellAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <div className="text-sm font-semibold text-emerald-50">
              Phone notifications on
            </div>
            <div className="mt-0.5 text-xs leading-5 text-emerald-100/55">
              Private messages and important team notifications only. Ordinary team chat stays quiet.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={disableNotifications}
          disabled={state === "disabling"}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          Turn off
        </button>
        {feedback ? (
          <div className="text-xs text-emerald-100/60 sm:hidden">{feedback}</div>
        ) : null}
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
        <BellSlashIcon className="mt-0.5 h-5 w-5 shrink-0 text-white/40" />
        <div>
          <div className="text-sm font-semibold text-white/75">
            Phone notifications are blocked
          </div>
          <div className="mt-0.5 text-xs leading-5 text-white/40">
            SIXFL chat still works normally. Notifications can be enabled later in your browser or phone settings.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <BellAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300/80" />
          <div>
            <div className="text-sm font-semibold text-white">
              Turn on SIXFL notifications
            </div>
            <div className="mt-0.5 text-xs leading-5 text-white/45">
              Only private messages and important team notifications. Normal chat replies will not pop up on your phone.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={enableNotifications}
          disabled={state === "checking" || state === "enabling"}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "enabling"
            ? "Turning on…"
            : state === "checking"
              ? "Checking…"
              : "Turn on"}
        </button>
      </div>

      {feedback ? (
        <div className="mt-2 text-xs text-red-100/75">{feedback}</div>
      ) : null}
    </div>
  );
}
