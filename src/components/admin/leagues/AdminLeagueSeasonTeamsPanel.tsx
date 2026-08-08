"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type SeasonTeam = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  divisionId: string | null;
  divisionName: string | null;
  canEnterSeason?: boolean;
  affiliationLabel?: string;
};

type Division = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

type Payload = {
  league?: { id: string; name: string; season: string | null; slug: string };
  divisions?: Division[];
  teams?: SeasonTeam[];
  affiliatedTeams?: SeasonTeam[];
  error?: string;
};

function leagueIdFromPathname(pathname: string) {
  return pathname.match(/^\/admin\/leagues\/([^/]+)\/?$/)?.[1] ?? null;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function divisionButtonClass(active: boolean) {
  return active
    ? "min-h-11 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-50"
    : "min-h-11 rounded-xl border border-white/10 bg-[#0d1428] px-4 py-2 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:text-white";
}

function TeamIdentity({ team }: { team: SeasonTeam }) {
  return (
    <Link
      href={`/admin/teams/${team.teamId}`}
      className="flex min-w-0 items-start gap-3 rounded-xl transition hover:text-emerald-300"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30 text-xs font-black text-white/70">
        {team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logoUrl} alt="" className="h-full w-full object-contain p-1" />
        ) : (
          initials(team.teamName)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="break-words text-base font-semibold leading-6 text-white">
          {team.teamName}
        </div>
        <div className="mt-1 break-all text-xs leading-5 text-white/45">
          {team.contactEmail || "No email"}
          {team.contactPhone ? ` · ${team.contactPhone}` : ""}
        </div>
      </div>
    </Link>
  );
}

export default function AdminLeagueSeasonTeamsPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const leagueId = useMemo(() => leagueIdFromPathname(pathname), [pathname]);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/admin/leagues/${encodeURIComponent(leagueId)}/season-teams`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as Payload | null;
        if (!response.ok || !data) {
          throw new Error(data?.error || "The season teams could not be loaded.");
        }
        if (!cancelled) setPayload(data);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "The season teams could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  if (!leagueId) return null;

  const teams = payload?.teams ?? [];
  const divisions = payload?.divisions ?? [];
  const affiliatedTeams = payload?.affiliatedTeams ?? [];

  async function updateMembership(input: {
    teamId: string;
    method: "POST" | "DELETE";
    divisionId?: string | null;
  }) {
    if (!leagueId) return;

    const key = `${input.teamId}:${input.method}:${input.divisionId ?? "none"}`;
    setBusyKey(key);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/leagues/${encodeURIComponent(leagueId)}/season-teams`,
        {
          method: input.method,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamId: input.teamId,
            ...(input.method === "POST" ? { divisionId: input.divisionId ?? null } : {}),
          }),
        },
      );
      const data = (await response.json().catch(() => null)) as Payload | null;
      if (!response.ok) {
        throw new Error(data?.error || "The season membership could not be updated.");
      }

      const refreshed = await fetch(
        `/api/admin/leagues/${encodeURIComponent(leagueId)}/season-teams`,
        { cache: "no-store", credentials: "same-origin" },
      );
      const refreshedPayload = (await refreshed.json().catch(() => null)) as Payload | null;
      if (!refreshed.ok || !refreshedPayload) {
        throw new Error(refreshedPayload?.error || "The updated team list could not be reloaded.");
      }

      setPayload(refreshedPayload);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The season membership could not be updated.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="mx-auto mt-6 max-w-7xl rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">
            Current season membership
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Teams in this season</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            {loading
              ? "Loading the current season teams…"
              : `${teams.length} active team${teams.length === 1 ? "" : "s"} in ${payload?.league?.season || "this season"}. These assignments control division tables and fixture eligibility.`}
          </p>
        </div>
        <Link
          href="/admin/teams/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15"
        >
          Create new team
        </Link>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {!loading && teams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/55">
            No teams are entered in this season yet.
          </div>
        ) : null}

        {teams.map((team) => (
          <article key={team.teamId} className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,1.6fr)] lg:items-center">
              <TeamIdentity team={team} />

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {[{ id: "", name: "No division" }, ...divisions].map((division) => {
                  const active = (team.divisionId ?? "") === division.id;
                  const key = `${team.teamId}:POST:${division.id || "none"}`;
                  const busy = busyKey === key;
                  return (
                    <button
                      key={division.id || "none"}
                      type="button"
                      disabled={Boolean(busyKey)}
                      className={divisionButtonClass(active)}
                      onClick={() =>
                        void updateMembership({
                          teamId: team.teamId,
                          method: "POST",
                          divisionId: division.id || null,
                        })
                      }
                    >
                      {busy ? "Saving…" : division.name}
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  className="min-h-11 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:opacity-50"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${team.teamName} from this season? The team will remain affiliated and can still receive league communications.`,
                      )
                    ) {
                      void updateMembership({ teamId: team.teamId, method: "DELETE" });
                    }
                  }}
                >
                  {busyKey === `${team.teamId}:DELETE:none` ? "Updating…" : "Make affiliated only"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-8 border-t border-white/10 pt-6">
        <h3 className="text-lg font-semibold text-white">Affiliated teams not in this season</h3>
        <p className="mt-1 text-sm leading-6 text-white/55">
          These teams can keep captain access, PlayerPool access and league communications without appearing in the current table or fixtures.
        </p>

        <div className="mt-4 space-y-3">
          {affiliatedTeams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/50">
              No affiliated-only teams at the moment.
            </div>
          ) : null}

          {affiliatedTeams.map((team) => (
            <article key={team.teamId} className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.05] p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <TeamIdentity team={team} />

                {team.canEnterSeason === false ? (
                  <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 sm:text-right">
                    <div className="text-xs font-semibold text-sky-100">
                      {team.affiliationLabel || "Communications only"}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-4 text-white/45">
                      No league · assign a league from the team page first
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    className="min-h-11 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:opacity-50"
                    onClick={() =>
                      void updateMembership({
                        teamId: team.teamId,
                        method: "POST",
                        divisionId: null,
                      })
                    }
                  >
                    {busyKey === `${team.teamId}:POST:none` ? "Adding…" : "Enter current season"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
