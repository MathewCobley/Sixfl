"use client";

import { useEffect, useState } from "react";

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

const DEFAULT_COLOUR = "#16A34A";

type KitColourResponse = {
  teamName?: string;
  colour?: string | null;
  updatedTeams?: number;
  error?: string;
};

function Shirt({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-12 w-14 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]"
      style={{
        backgroundColor: colour,
        clipPath:
          "polygon(20% 0,34% 0,40% 13%,60% 13%,66% 0,80% 0,100% 24%,84% 42%,77% 33%,77% 100%,23% 100%,23% 33%,16% 42%,0 24%)",
        outline:
          colour === "#FFFFFF" ? "1px solid rgba(148,163,184,0.85)" : undefined,
        outlineOffset: colour === "#FFFFFF" ? "-1px" : undefined,
      }}
    />
  );
}

export default function TeamKitColourPicker({ teamId }: { teamId: string }) {
  const [teamName, setTeamName] = useState("Team");
  const [savedColour, setSavedColour] = useState<string | null>(null);
  const [selectedColour, setSelectedColour] = useState(DEFAULT_COLOUR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/teams/${encodeURIComponent(teamId)}/kit-colour`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as KitColourResponse;
        if (!response.ok) throw new Error(data.error || "Could not load shirt colour.");
        if (cancelled) return;

        setTeamName(data.teamName || "Team");
        setSavedColour(data.colour ?? null);
        setSelectedColour(data.colour || DEFAULT_COLOUR);
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof Error ? error.message : "Could not load shirt colour.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  async function save(colour: string | null) {
    if (saving) return;
    setSaving(true);
    setMessage("");

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
      if (!response.ok) throw new Error(data.error || "Could not save shirt colour.");

      setSavedColour(data.colour ?? null);
      if (data.colour) setSelectedColour(data.colour);
      setMessage(
        data.updatedTeams && data.updatedTeams > 1
          ? `Saved for ${data.updatedTeams} season records.`
          : "Shirt colour saved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save shirt colour.",
      );
    } finally {
      setSaving(false);
    }
  }

  const previewColour = savedColour ?? selectedColour;

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-500/[0.07] px-5 py-5 shadow-[0_14px_50px_rgba(0,0,0,0.22)] sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
            <Shirt colour={previewColour} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/75">
              Match kit
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Primary shirt colour
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/60">
              Choose the top colour {teamName} normally wears. Captains will see it beside fixture details.
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/70 lg:min-w-56">
          Custom colour
          <input
            aria-label="Choose custom shirt colour"
            type="color"
            value={selectedColour}
            onChange={(event) => setSelectedColour(event.target.value.toUpperCase())}
            disabled={loading || saving}
            className="h-10 w-14 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {PRESET_COLOURS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setSelectedColour(preset.value)}
            disabled={loading || saving}
            title={preset.label}
            aria-label={`Choose ${preset.label}`}
            className={`h-9 w-9 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
              selectedColour === preset.value
                ? "scale-110 border-sky-200"
                : "border-white/20 hover:scale-105 hover:border-white/55"
            }`}
            style={{ backgroundColor: preset.value }}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => save(selectedColour)}
          disabled={loading || saving}
          className="inline-flex items-center justify-center rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : loading ? "Loading…" : "Save shirt colour"}
        </button>
        <button
          type="button"
          onClick={() => save(null)}
          disabled={loading || saving || savedColour === null}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear colour
        </button>
        <span className="font-mono text-xs text-white/45">
          {savedColour || "Not set"}
        </span>
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm ${
            message.toLowerCase().includes("could not") ||
            message.toLowerCase().includes("valid")
              ? "text-red-200"
              : "text-emerald-200"
          }`}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
