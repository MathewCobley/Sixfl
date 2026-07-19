"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

const PRESET_COLOURS = [
  { label: "Black", value: "#111827" },
  { label: "White", value: "#FFFFFF" },
  { label: "Red", value: "#DC2626" },
  { label: "Royal blue", value: "#2563EB" },
  { label: "Sky blue", value: "#38BDF8" },
  { label: "Green", value: "#16A34A" },
  { label: "Yellow", value: "#FACC15" },
  { label: "Orange", value: "#F97316" },
  { label: "Purple", value: "#9333EA" },
  { label: "Pink", value: "#EC4899" },
  { label: "Navy", value: "#172554" },
];

const DEFAULT_PICKER_COLOUR = "#16A34A";

type KitColourResponse = {
  teamId?: string;
  teamName?: string;
  colour?: string | null;
  updatedTeams?: number;
  error?: string;
};

function getTeamId(pathname: string) {
  return pathname.match(/^\/admin\/teams\/([^/]+)\/?$/)?.[1] ?? null;
}

function findTeamSettingsForm(teamId: string) {
  return (
    Array.from(document.querySelectorAll<HTMLFormElement>("form")).find((form) => {
      const idInput = form.querySelector<HTMLInputElement>('input[name="id"]');
      const nameInput = form.querySelector<HTMLInputElement>('input[name="name"]');

      return idInput?.value === teamId && Boolean(nameInput);
    }) ?? null
  );
}

function findExistingHost(teamId: string) {
  return (
    Array.from(
      document.querySelectorAll<HTMLElement>("[data-sixfl-kit-colour-host]"),
    ).find((element) => element.dataset.sixflKitColourHost === teamId) ?? null
  );
}

function ShirtPreview({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-11 w-12 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]"
      style={{
        backgroundColor: colour,
        clipPath:
          "polygon(20% 0,34% 0,40% 13%,60% 13%,66% 0,80% 0,100% 24%,84% 42%,77% 33%,77% 100%,23% 100%,23% 33%,16% 42%,0 24%)",
        outline:
          colour.toUpperCase() === "#FFFFFF"
            ? "1px solid rgba(148,163,184,0.85)"
            : undefined,
        outlineOffset: colour.toUpperCase() === "#FFFFFF" ? "-1px" : undefined,
      }}
    />
  );
}

export default function TeamKitColourAdminBridge() {
  const pathname = usePathname();
  const teamId = useMemo(() => getTeamId(pathname), [pathname]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [teamName, setTeamName] = useState("Team");
  const [storedColour, setStoredColour] = useState<string | null>(null);
  const [pickerColour, setPickerColour] = useState(DEFAULT_PICKER_COLOUR);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!teamId) {
      setHost(null);
      return;
    }

    let mounted = true;
    let installedHost: HTMLElement | null = null;

    const install = () => {
      if (!mounted) return true;

      const form = findTeamSettingsForm(teamId);
      if (!form) return false;

      installedHost = findExistingHost(teamId) ?? document.createElement("div");
      installedHost.dataset.sixflKitColourHost = teamId;
      installedHost.classList.add("w-full");

      if (!installedHost.isConnected) {
        form.insertBefore(installedHost, form.firstChild);
      }

      setHost(installedHost);
      return true;
    };

    if (!install()) {
      const observer = new MutationObserver(() => {
        if (install()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      return () => {
        mounted = false;
        observer.disconnect();
        installedHost?.remove();
      };
    }

    return () => {
      mounted = false;
      installedHost?.remove();
    };
  }, [teamId]);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;
    setStatus("");

    fetch(`/api/admin/teams/${encodeURIComponent(teamId)}/kit-colour`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as KitColourResponse;
        if (!response.ok) throw new Error(data.error || "Could not load shirt colour.");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setTeamName(data.teamName || "Team");
        setStoredColour(data.colour ?? null);
        setPickerColour(data.colour || DEFAULT_PICKER_COLOUR);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Could not load shirt colour.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function saveColour(colour: string | null) {
    if (!teamId || loading) return;

    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(
        `/api/admin/teams/${encodeURIComponent(teamId)}/kit-colour`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colour }),
        },
      );
      const data = (await response.json()) as KitColourResponse;

      if (!response.ok) {
        throw new Error(data.error || "Could not save shirt colour.");
      }

      setStoredColour(data.colour ?? null);
      if (data.colour) setPickerColour(data.colour);
      setStatus(
        data.updatedTeams && data.updatedTeams > 1
          ? `Saved for ${data.updatedTeams} season records of ${teamName}.`
          : "Shirt colour saved.",
      );
      window.dispatchEvent(new CustomEvent("sixfl:kit-colours-updated"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save shirt colour.");
    } finally {
      setLoading(false);
    }
  }

  if (!teamId || !host) return null;

  return createPortal(
    <div
      data-sixfl-kit-colour-picker
      className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <ShirtPreview colour={storedColour || pickerColour} />
          <div>
            <div className="text-sm font-semibold text-white">Primary shirt colour</div>
            <p className="mt-1 text-xs leading-5 text-white/55">
              This coloured shirt is shown beside {teamName} on fixture and result screens, including the captain view.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
          Custom colour
          <input
            aria-label="Choose custom shirt colour"
            type="color"
            value={pickerColour}
            onChange={(event) => setPickerColour(event.target.value.toUpperCase())}
            className="h-9 w-12 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_COLOURS.map((preset) => {
          const selected = pickerColour === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => setPickerColour(preset.value)}
              title={preset.label}
              aria-label={`Choose ${preset.label}`}
              className={`h-8 w-8 rounded-full border-2 transition ${
                selected
                  ? "scale-110 border-emerald-300"
                  : "border-white/20 hover:scale-105 hover:border-white/50"
              }`}
              style={{ backgroundColor: preset.value }}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => saveColour(pickerColour)}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save shirt colour"}
        </button>
        <button
          type="button"
          onClick={() => saveColour(null)}
          disabled={loading || storedColour === null}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear colour
        </button>
        <span className="font-mono text-xs text-white/45">
          {storedColour || "Not set — neutral shirt used"}
        </span>
      </div>

      {status ? (
        <div
          className={`mt-3 text-sm ${
            status.toLowerCase().includes("could not") || status.toLowerCase().includes("valid")
              ? "text-red-200"
              : "text-emerald-200"
          }`}
        >
          {status}
        </div>
      ) : null}
    </div>,
    host,
  );
}
