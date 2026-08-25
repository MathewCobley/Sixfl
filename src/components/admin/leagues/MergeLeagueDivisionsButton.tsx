"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type SeasonTeamsPayload = {
  divisions?: Array<{ id: string; name: string }>;
};

type MergePayload = {
  ok?: boolean;
  alreadyMerged?: boolean;
  activeTeams?: number;
  savedResults?: number;
  futureFixturesMerged?: number;
  message?: string;
  error?: string;
};

function leagueIdFromPathname(pathname: string) {
  return pathname.match(/^\/admin\/leagues\/([^/]+)\/?$/)?.[1] ?? null;
}

export default function MergeLeagueDivisionsButton() {
  const pathname = usePathname();
  const router = useRouter();
  const leagueId = useMemo(() => leagueIdFromPathname(pathname), [pathname]);
  const [divisionNames, setDivisionNames] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) {
      setDivisionNames([]);
      return;
    }

    let cancelled = false;
    setChecking(true);

    fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/season-teams`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as SeasonTeamsPayload | null;
        if (!response.ok || !payload) return;
        if (!cancelled) {
          setDivisionNames((payload.divisions ?? []).map((division) => division.name));
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  if (!leagueId) return null;

  if (divisionNames.length === 0) {
    if (message || error) {
      return (
        <section
          className={`mx-auto w-full max-w-7xl rounded-3xl border p-5 sm:p-6 ${
            error
              ? "border-red-400/25 bg-red-500/[0.08]"
              : "border-emerald-400/25 bg-emerald-500/[0.08]"
          }`}
        >
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${
              error ? "text-red-200/75" : "text-emerald-200/75"
            }`}
          >
            {error ? "League structure update failed" : "League structure updated"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {error ? "The divisions were not changed" : "Divisions merged successfully"}
          </h2>
          <p
            className={`mt-2 text-sm leading-6 ${
              error ? "text-red-100" : "text-emerald-100"
            }`}
          >
            {error || message}
          </p>
        </section>
      );
    }
    return null;
  }

  if (checking) return null;

  async function mergeDivisions() {
    if (!leagueId || merging) return;

    const confirmed = window.confirm(
      `Merge ${divisionNames.join(" and ")} into one league table?\n\nAll current results will be kept. Completed fixtures will retain their old division tag for history, while current team memberships and future/unplayed fixtures will become one combined league.`,
    );
    if (!confirmed) return;

    setMerging(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/leagues/${encodeURIComponent(leagueId)}/merge-divisions`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json().catch(() => null)) as MergePayload | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "The divisions could not be merged.");
      }

      const successMessage = payload.alreadyMerged
        ? payload.message || "This league already uses one table."
        : `${payload.message || "The divisions were merged."} ${payload.activeTeams ?? 0} active teams remain in the season; ${payload.savedResults ?? 0} saved results were preserved; ${payload.futureFixturesMerged ?? 0} unplayed fixture${payload.futureFixturesMerged === 1 ? " was" : "s were"} moved into the combined pool.`;

      setMessage(successMessage);
      setDivisionNames([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The divisions could not be merged.");
    } finally {
      setMerging(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl rounded-3xl border border-amber-400/25 bg-amber-500/[0.07] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/70">
            League structure
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Merge into one league table</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Current divisions: {divisionNames.join(" · ")}. This keeps every saved result and player record, keeps completed fixture division tags for history, and combines current teams plus future fixtures into one table and one fixture pool.
          </p>
        </div>
        <button
          type="button"
          disabled={merging}
          onClick={() => void mergeDivisions()}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"
        >
          {merging ? "Merging divisions…" : "Merge divisions · keep results"}
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {error}
        </div>
      ) : null}
    </section>
  );
}
