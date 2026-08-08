"use client";

import { useEffect, useMemo, useState } from "react";

type FixtureChoice = {
  id: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  totalGoals: number;
  videoUrl: string | null;
};

type Candidate = {
  id: string;
  fixtureId: string;
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  opponentName: string;
  scorerName: string | null;
  goalNumber: number;
  nominationCount: number;
  voteCount: number;
  kickoffAt: string;
  leagueName: string;
  leagueSeason: string | null;
  videoUrl: string | null;
  fullMatchUrl: string | null;
  weekOf: string;
};

type Payload = {
  nomination: {
    weekOf: string;
    closesAt: string;
    fixtures: FixtureChoice[];
    nominatedCandidateIds: string[];
  };
  voting: {
    weekOf: string;
    closesAt: string;
    open: boolean;
    verifiedPlayer: boolean;
    selectedCandidateId: string | null;
    candidates: Candidate[];
  };
  latestWinner: Candidate | null;
};

type Draft = {
  goalNumber: string;
  scoringTeamId: string;
  scorerName: string;
  comment: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatWeek(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function defaultDraft(fixture: FixtureChoice, teamId: string): Draft {
  return {
    goalNumber: "",
    scoringTeamId:
      fixture.homeTeamId === teamId || fixture.awayTeamId === teamId
        ? teamId
        : fixture.homeTeamId,
    scorerName: "",
    comment: "",
  };
}

export default function CommunityGoalOfWeekPanel({ teamId }: { teamId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/goal-of-week/community?teamId=${encodeURIComponent(teamId)}`,
        { cache: "no-store" },
      );
      const result = (await response.json().catch(() => null)) as
        | Payload
        | { error?: string }
        | null;
      if (!response.ok || !result || "error" in result) {
        throw new Error(
          result && "error" in result && result.error
            ? result.error
            : "Could not load Goal of the Week.",
        );
      }
      setPayload(result);
      setDrafts((current) => {
        const next = { ...current };
        for (const fixture of result.nomination.fixtures) {
          if (!next[fixture.id]) next[fixture.id] = defaultDraft(fixture, teamId);
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Goal of the Week.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // teamId identifies the dashboard context; load once when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const selectedCandidateId = payload?.voting.selectedCandidateId ?? null;
  const votingCandidates = payload?.voting.candidates ?? [];
  const winner = payload?.latestWinner ?? null;
  const hasSomethingToShow = Boolean(
    payload?.nomination.fixtures.length || votingCandidates.length || winner,
  );

  const ballotWeekLabel = useMemo(
    () => (payload ? formatWeek(payload.voting.weekOf) : ""),
    [payload],
  );

  async function nominate(fixture: FixtureChoice) {
    const draft = drafts[fixture.id] ?? defaultDraft(fixture, teamId);
    setBusyKey(`nominate:${fixture.id}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/goal-of-week/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "nominate",
          teamId,
          fixtureId: fixture.id,
          goalNumber: Number(draft.goalNumber),
          scoringTeamId: draft.scoringTeamId,
          scorerName: draft.scorerName,
          comment: draft.comment,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error || "The goal could not be nominated.");
      setMessage("Goal nominated. If somebody else picks the same goal, their nomination will be added to the same entry.");
      setDrafts((current) => ({
        ...current,
        [fixture.id]: defaultDraft(fixture, teamId),
      }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The goal could not be nominated.");
    } finally {
      setBusyKey("");
    }
  }

  async function vote(candidateId: string) {
    setBusyKey(`vote:${candidateId}`);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/goal-of-week/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "vote", teamId, candidateId }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok) throw new Error(result?.error || "Your vote could not be saved.");
      setMessage("Vote saved. You can change it until voting closes.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your vote could not be saved.");
    } finally {
      setBusyKey("");
    }
  }

  if (loading && !payload) {
    return (
      <section className="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/[0.06] p-6 text-sm text-white/60">
        Loading Goal of the Week…
      </section>
    );
  }

  if (error && !payload) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
        <h2 className="text-xl font-semibold text-white">Goal of the Week</h2>
        <p className="mt-2 text-sm text-white/55">{error}</p>
      </section>
    );
  }

  if (!payload) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.13),transparent_34%),rgba(255,255,255,0.035)]">
      <div className="border-b border-white/10 px-6 py-6 lg:px-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-200/70">
          Chosen by SIXFL players
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">Goal of the Week</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
          Nominate a goal from a completed SIXFL TV match using the fixture and goal number. Duplicate nominations are combined. The six most-nominated goals make the following week's verified-player ballot.
        </p>
      </div>

      <div className="space-y-7 p-6 lg:p-8">
        {message ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {winner ? (
          <div className="rounded-3xl border border-amber-300/25 bg-amber-400/[0.08] p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/65">
              Latest player-voted winner
            </div>
            <div className="mt-2 text-xl font-black text-white">
              {winner.scorerName || winner.teamName} · Goal {winner.goalNumber}
            </div>
            <div className="mt-1 text-sm text-white/55">
              {winner.teamName} vs {winner.opponentName} · {winner.voteCount} vote{winner.voteCount === 1 ? "" : "s"}
            </div>
            {winner.videoUrl ? (
              <a
                href={winner.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-50"
              >
                Watch winning match highlights ▶
              </a>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Nominate this week's goals</h3>
              <p className="mt-1 text-sm text-white/50">
                Nominations close at the end of the fixture week. You can nominate more than one genuinely outstanding goal.
              </p>
            </div>
            <span className="text-xs text-white/40">
              Week of {formatWeek(payload.nomination.weekOf)}
            </span>
          </div>

          {payload.nomination.fixtures.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
              No completed SIXFL TV match for this team is ready for nominations this week yet.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {payload.nomination.fixtures.map((fixture) => {
                const draft = drafts[fixture.id] ?? defaultDraft(fixture, teamId);
                const isBusy = busyKey === `nominate:${fixture.id}`;
                return (
                  <div key={fixture.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {fixture.homeTeamName} {fixture.homeScore}-{fixture.awayScore} {fixture.awayTeamName}
                        </div>
                        <div className="mt-1 text-xs text-white/45">
                          {formatDate(fixture.kickoffAt)} · {fixture.totalGoals} goal{fixture.totalGoals === 1 ? "" : "s"} in the match
                        </div>
                      </div>
                      {fixture.videoUrl ? (
                        <a
                          href={fixture.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-xl border border-fuchsia-300/25 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-100"
                        >
                          Watch highlights ▶
                        </a>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-1 text-xs font-semibold text-white/55">
                        Goal number
                        <select
                          value={draft.goalNumber}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [fixture.id]: { ...draft, goalNumber: event.target.value },
                            }))
                          }
                          className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0d1428] px-3 text-sm text-white"
                        >
                          <option value="">Choose goal</option>
                          {Array.from({ length: fixture.totalGoals }, (_, index) => index + 1).map((number) => (
                            <option key={number} value={number}>Goal {number}</option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-white/55">
                        Scoring team
                        <select
                          value={draft.scoringTeamId}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [fixture.id]: { ...draft, scoringTeamId: event.target.value },
                            }))
                          }
                          className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0d1428] px-3 text-sm text-white"
                        >
                          <option value={fixture.homeTeamId}>{fixture.homeTeamName}</option>
                          <option value={fixture.awayTeamId}>{fixture.awayTeamName}</option>
                        </select>
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-white/55">
                        Scorer <span className="font-normal text-white/35">optional</span>
                        <input
                          value={draft.scorerName}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [fixture.id]: { ...draft, scorerName: event.target.value },
                            }))
                          }
                          maxLength={100}
                          placeholder="Player name"
                          className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0d1428] px-3 text-sm text-white placeholder:text-white/25"
                        />
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-white/55">
                        Why nominate it? <span className="font-normal text-white/35">optional</span>
                        <input
                          value={draft.comment}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [fixture.id]: { ...draft, comment: event.target.value },
                            }))
                          }
                          maxLength={180}
                          placeholder="Top corner, long range…"
                          className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#0d1428] px-3 text-sm text-white placeholder:text-white/25"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy || !draft.goalNumber || !draft.scoringTeamId}
                      onClick={() => void nominate(fixture)}
                      className="mt-4 rounded-xl bg-fuchsia-400 px-4 py-2.5 text-sm font-black text-black transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isBusy ? "Nominating…" : "Nominate this goal"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 pt-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Player vote</h3>
              <p className="mt-1 text-sm text-white/50">
                One vote per verified SIXFL player each week. You can change your choice until voting closes.
              </p>
            </div>
            <span className="text-xs text-white/40">Goals from week of {ballotWeekLabel}</span>
          </div>

          {votingCandidates.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/50">
              There are no nominated goals on this week's ballot yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {votingCandidates.map((candidate, index) => {
                const selected = selectedCandidateId === candidate.id;
                const isBusy = busyKey === `vote:${candidate.id}`;
                return (
                  <article
                    key={candidate.id}
                    className={`rounded-3xl border p-5 ${
                      selected
                        ? "border-fuchsia-300/40 bg-fuchsia-500/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200/60">
                          Finalist {index + 1}
                        </div>
                        <div className="mt-1 text-lg font-black text-white">
                          {candidate.scorerName || candidate.teamName} · Goal {candidate.goalNumber}
                        </div>
                        <div className="mt-1 text-sm text-white/50">
                          {candidate.teamName} vs {candidate.opponentName}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/55">
                        {candidate.nominationCount} nomination{candidate.nominationCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {candidate.videoUrl ? (
                        <a
                          href={candidate.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/75"
                        >
                          Watch Goal {candidate.goalNumber} in highlights ▶
                        </a>
                      ) : null}
                      {candidate.fullMatchUrl ? (
                        <a
                          href={candidate.fullMatchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/55"
                        >
                          Full match ▶
                        </a>
                      ) : null}
                    </div>

                    {payload.voting.open ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void vote(candidate.id)}
                        className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-black transition disabled:opacity-50 ${
                          selected
                            ? "border border-fuchsia-300/40 bg-fuchsia-300/15 text-fuchsia-50"
                            : "bg-fuchsia-400 text-black hover:bg-fuchsia-300"
                        }`}
                      >
                        {isBusy ? "Saving…" : selected ? "✓ Your vote" : "Vote for this goal"}
                      </button>
                    ) : (
                      <div className="mt-4 text-sm text-white/50">
                        Voting closed · {candidate.voteCount} vote{candidate.voteCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {!payload.voting.verifiedPlayer ? (
            <p className="mt-3 text-xs text-amber-100/70">
              You can view the ballot, but voting is limited to verified SIXFL players and captains.
            </p>
          ) : payload.voting.open ? (
            <p className="mt-3 text-xs text-white/40">
              Voting closes {formatDate(payload.voting.closesAt)}. Vote totals stay hidden until voting closes.
            </p>
          ) : null}
        </div>

        {!hasSomethingToShow ? (
          <p className="text-sm text-white/45">Goal of the Week will appear here once recorded matches and nominations are available.</p>
        ) : null}
      </div>
    </section>
  );
}
