"use client";

import { useEffect, useState } from "react";

type AdminTvFixture = {
  id: string;
  sixflTvRecorded: boolean;
  sixflTvUrl: string | null;
};

let fixtureStatePromise: Promise<Map<string, AdminTvFixture>> | null = null;

function loadFixtureState() {
  if (!fixtureStatePromise) {
    fixtureStatePromise = fetch("/api/admin/fixtures/sixfl-tv", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load SIXFL TV status.");
        const payload = (await response.json().catch(() => null)) as {
          fixtures?: AdminTvFixture[];
          fixtureIds?: string[];
        } | null;
        const fixtures = new Map<string, AdminTvFixture>();
        for (const fixture of payload?.fixtures ?? []) fixtures.set(fixture.id, fixture);
        for (const fixtureId of payload?.fixtureIds ?? []) {
          if (!fixtures.has(fixtureId)) {
            fixtures.set(fixtureId, {
              id: fixtureId,
              sixflTvRecorded: true,
              sixflTvUrl: null,
            });
          }
        }
        return fixtures;
      })
      .catch((error) => {
        fixtureStatePromise = null;
        throw error;
      });
  }
  return fixtureStatePromise;
}

export default function NightBoardSixflTvToggle({ fixtureId }: { fixtureId: string }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    void loadFixtureState()
      .then((fixtures) => {
        if (cancelled) return;
        setChecked(Boolean(fixtures.get(fixtureId)?.sixflTvRecorded));
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not load SIXFL TV status");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fixtureId]);

  async function save(nextChecked: boolean) {
    const previous = checked;
    setChecked(nextChecked);
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/fixtures/sixfl-tv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId,
          sixflTvRecorded: nextChecked,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Could not save SIXFL TV status.");
      }

      setMessage(nextChecked ? "Selected for SIXFL TV" : "Not selected for SIXFL TV");
    } catch (error) {
      setChecked(previous);
      setMessage(error instanceof Error ? error.message : "Could not save SIXFL TV status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-3 text-xs text-fuchsia-100">
      <label className="flex cursor-pointer items-center justify-between gap-3 font-semibold">
        <span>
          SIXFL TV
          <span className="ml-2 font-normal text-fuchsia-100/55">Record this match</span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          disabled={loading || saving}
          onChange={(event) => void save(event.target.checked)}
          className="h-4 w-4 accent-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>
      <div className="mt-1 text-[10px] leading-4 text-fuchsia-100/55">
        {loading ? "Loading status…" : saving ? "Saving…" : message || (checked ? "Selected for SIXFL TV" : "Not selected")}
      </div>
    </div>
  );
}
