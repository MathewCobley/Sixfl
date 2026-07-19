"use client";

import { useState } from "react";

import TeamShirt from "@/components/fixtures/TeamShirt";

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
  colour?: string | null;
  updatedTeams?: number;
  error?: string;
};

type Props = {
  teamId: string;
  teamName: string;
  initialColour: string | null;
};

export default function TeamKitColourAdminBridge({
  teamId,
  teamName,
  initialColour,
}: Props) {
  const [storedColour, setStoredColour] = useState<string | null>(initialColour);
  const [pickerColour, setPickerColour] = useState(
    initialColour ?? DEFAULT_PICKER_COLOUR,
  );
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function saveColour(colour: string | null) {
    if (loading) return;

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
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save shirt colour.",
      );
    } finally {
      setLoading(false);
    }
  }

  const displayColour = storedColour ?? pickerColour;

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] px-5 py-5 shadow-[0_14px_50px_rgba(0,0,0,0.22)] sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
            <TeamShirt colour={displayColour} teamName={teamName} size="lg" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/75">
              Match kit
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Primary shirt colour
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
              Choose the top colour {teamName} normally wears. It is shown beside
              the team on fixture screens so captains can identify potential kit
              clashes.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70 lg:min-w-56">
          Custom colour
          <input
            aria-label="Choose custom shirt colour"
            type="color"
            value={pickerColour}
            onChange={(event) =>
              setPickerColour(event.target.value.toUpperCase())
            }
            className="h-10 w-14 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {PRESET_COLOURS.map((preset) => {
          const selected = pickerColour === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => setPickerColour(preset.value)}
              title={preset.label}
              aria-label={`Choose ${preset.label}`}
              className={`h-9 w-9 rounded-full border-2 transition ${
                selected
                  ? "scale-110 border-sky-200"
                  : "border-white/20 hover:scale-105 hover:border-white/55"
              }`}
              style={{ backgroundColor: preset.value }}
            />
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => saveColour(pickerColour)}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
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
        <p
          className={`mt-3 text-sm ${
            status.toLowerCase().includes("could not") ||
            status.toLowerCase().includes("valid")
              ? "text-red-200"
              : "text-emerald-200"
          }`}
        >
          {status}
        </p>
      ) : null}
    </section>
  );
}
