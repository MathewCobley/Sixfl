"use client";

import { useState } from "react";

type LeagueOption = {
  id: string;
  label: string;
};

type GenerateFixturesResponse = {
  created?: number;
  round?: number;
  error?: string;
  requestId?: string;
};

export default function GenerateNextWeekFixturesPanel({
  leagues,
}: {
  leagues: LeagueOption[];
}) {
  const [leagueId, setLeagueId] = useState(leagues[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!leagueId || busy) return;

    setBusy(true);
    setMessage("Checking previous fixtures and choosing the next set of opponents…");
    setError(null);

    try {
      const response = await fetch("/api/admin/fixtures/generate-next-week", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ leagueId }),
      });

      const payload = (await response.json().catch(() => null)) as
        | GenerateFixturesResponse
        | null;

      if (!response.ok) {
        const reference = payload?.requestId ? ` Reference: ${payload.requestId}.` : "";
        throw new Error(`${payload?.error ?? "Could not generate the next week."}${reference}`);
      }

      if (payload?.created === undefined) {
        throw new Error("The fixture generator returned an incomplete response.");
      }

      setMessage(
        `Created ${payload.created} draft fixture${payload.created === 1 ? "" : "s"}${
          payload.round ? ` for week ${payload.round}` : ""
        }. They are ready to review on the Fixtures page.`,
      );
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Could not generate the next week.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.07] p-6 md:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
        Most common job
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Generate one week of fixtures</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
        Creates only the next matchweek for the selected league. SIXFL looks at previous fixtures,
        avoids recent repeat pairings where possible and balances how many games teams have played.
        The new fixtures are drafts only — nothing is published or sent to teams.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            League to create next week for
          </label>
          <select
            value={leagueId}
            onChange={(event) => setLeagueId(event.target.value)}
            disabled={leagues.length === 0 || busy}
            className="h-14 w-full rounded-2xl border border-white/10 bg-black/40 px-4 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-40"
          >
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void generate()}
          disabled={!leagueId || busy}
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-emerald-400 px-6 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate next week"}
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-white/45">
        Uses the latest existing fixture date, venue and pitch count as the starting point. Review the new drafts before publishing them.
      </p>

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-black/20 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </section>
  );
}
