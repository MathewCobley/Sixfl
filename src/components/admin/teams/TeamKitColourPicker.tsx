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
      className="inline-block h-8 w-9 shrink-0 drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]"
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
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-[0_10px_34px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
            <Shirt colour={previewColour} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Primary shirt colour</h2>
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[10px] text-white/45">
                {savedColour || "Not set"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/50">
              Shown beside {teamName} on fixture and result screens.
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-white/8 bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-2" aria-label="Preset shirt colours">
            {PRESET_COLOURS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setSelectedColour(preset.value)}
                disabled={loading || saving}
                title={preset.label}
                aria-label={`Choose ${preset.label}`}
                className={`h-7 w-7 shrink-0 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedColour === preset.value
                    ? "scale-110 border-sky-200 ring-2 ring-sky-300/20"
                    : "border-white/20 hover:scale-105 hover:border-white/55"
                }`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 text-xs text-white/60">
              Custom
              <input
                aria-label="Choose custom shirt colour"
                type="color"
                value={selectedColour}
                onChange={(event) => setSelectedColour(event.target.value.toUpperCase())}
                disabled={loading || saving}
                className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>

            <button
              type="button"
              onClick={() => save(selectedColour)}
              disabled={loading || saving}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-sky-400 px-4 text-xs font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : loading ? "Loading…" : "Save colour"}
            </button>

            <button
              type="button"
              onClick={() => save(null)}
              disabled={loading || saving || savedColour === null}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-medium text-white/65 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <p
          className={`mt-3 text-xs ${
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
