"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import GoalNomineeCard, { type GoalNominee } from "./GoalNomineeCard";
import FormListboxField from "@/components/ui/FormListboxField";
import { useMonthlyGoals } from "./useMonthlyGoals";

function deadline(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(new Date(new Date(value).getTime() - 60000));
}
const field =
  "w-full min-w-0 rounded-xl border border-white/20 bg-[#101714] px-3 py-3 text-sm text-white";

export default function MonthlyGoalsPanel({
  playerApp = false,
}: {
  playerApp?: boolean;
}) {
  const { data, loading, error, refresh } = useMonthlyGoals();
  const [appTab, setAppTab] = useState<
    "nominees" | "voting" | "winners" | null
  >(null);
  const [nominating, setNominating] = useState(false);
  const [month, setMonth] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [clipAssetId, setClipAssetId] = useState("");
  const [scoringTeamId, setScoringTeamId] = useState("");
  const [scorerTeamMemberId, setScorerTeamMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(payload: Record<string, unknown>, mode?: "back") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFeedback("Saving…");
    setFailed(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/goal-of-month/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.error || "Could not save your selection.");
      setFeedback(
        payload.action === "vote"
          ? "Your vote is saved. You can change it before voting closes."
          : mode === "back"
            ? result.alreadyNominated
              ? "You already backed this goal."
              : "Your backing is saved. It now counts towards this goal’s nomination total."
            : result.alreadyNominated
              ? "You have already nominated this goal."
              : "Nomination saved. The exact SIXFL TV clip is now attached to this goal.",
      );
      await refresh();
      if (playerApp && payload.action === "nominate" && mode !== "back")
        setNominating(false);
    } catch (failure) {
      setFailed(true);
      setFeedback(
        failure instanceof Error && failure.name !== "AbortError"
          ? failure.message
          : "The save could not be confirmed. Refresh to check your selection before trying again.",
      );
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setBusy(false);
    }
  }

  const backGoal = (goal: GoalNominee) =>
    void save(
      {
        action: "nominate",
        fixtureId: goal.fixtureId,
        scoringTeamId: goal.teamId,
        clipAssetId: goal.clipAssetId,
        goalNumber: goal.goalNumber,
        scorerTeamMemberId: goal.scorerTeamMemberId,
      },
      "back",
    );

  if (loading && !data)
    return (
      <p role="status" className="p-6 text-white/70">
        Loading Goal of the Month…
      </p>
    );
  if (!data)
    return (
      <div className="rounded-2xl border border-red-300/20 p-6">
        <p role="alert">{error || "Competition unavailable."}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-3 underline"
        >
          Try again
        </button>
      </div>
    );

  const selected =
    data.nominations.find((period) => period.key === month) ??
    data.nominations[0];
  const fixture = selected?.fixtures.find((row) => row.id === fixtureId);
  const clip = fixture?.clips?.find((row) => row.id === clipAssetId);
  const usesClips = Boolean(fixture?.clips?.length);
  const scorerOptions =
    fixture?.squadPlayers
      .filter((player) => player.teamId === scoringTeamId)
      .map((player) => ({
        value: player.teamMemberId,
        label: `${player.squadNumber ? `#${player.squadNumber} · ` : ""}${player.name}`,
      })) ?? [];
  const eligible = data.viewer.eligible;
  const available = selected
    ? selected.usedNominations < selected.maxNominations
    : false;

  const activeTab = appTab ?? (data.voting.open ? "voting" : "nominees");
  const cardGrid = playerApp
    ? "grid gap-4"
    : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";
  const nominationForm = selected ? (
    <details
      className={
        playerApp ? "space-y-3" : "rounded-2xl border border-white/10 p-4"
      }
      open
    >
      <summary
        className={playerApp ? "sr-only" : "cursor-pointer text-lg font-bold"}
      >
        Nominate a goal
      </summary>
      <p className="my-3 text-sm text-white/65">
        {selected.usedNominations} of {selected.maxNominations} nominations used
        for {selected.label}. Several nominations of the same clip share one
        card.
      </p>
      <form
        className={
          playerApp ? "flex flex-col gap-4" : "grid gap-4 sm:grid-cols-2"
        }
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          void save({
            action: "nominate",
            fixtureId: values.get("fixtureId"),
            scoringTeamId: values.get("scoringTeamId"),
            clipAssetId: values.get("clipAssetId"),
            goalNumber: values.get("goalNumber"),
            scorerTeamMemberId: values.get("scorerTeamMemberId"),
          });
        }}
      >
        {playerApp ? (
          <div className="sm:col-span-2">
            <FormListboxField
              name="fixtureId"
              label="Recorded fixture"
              value={fixture?.id ?? ""}
              placeholder="Choose a recorded match"
              disabled={busy || !eligible || !available}
              onValueChange={(value) => {
                setFixtureId(value);
                setClipAssetId("");
                setScoringTeamId("");
                setScorerTeamMemberId("");
              }}
              options={selected.fixtures.map((row) => ({
                value: row.id,
                label: `${row.homeTeamName} v ${row.awayTeamName} · ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(row.kickoffAt))}`,
              }))}
            />
          </div>
        ) : (
          <label className="min-w-0 text-sm sm:col-span-2">
            Recorded fixture
            <select
              name="fixtureId"
              required
              value={fixture?.id ?? ""}
              onChange={(event) => {
                setFixtureId(event.target.value);
                setClipAssetId("");
                setScoringTeamId("");
                setScorerTeamMemberId("");
              }}
              disabled={busy || !eligible || !available}
              className={field}
            >
              <option value="">Choose a recorded match</option>
              {selected.fixtures.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.homeTeamName} v {row.awayTeamName} ·{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: "Europe/London",
                  }).format(new Date(row.kickoffAt))}
                </option>
              ))}
            </select>
          </label>
        )}

        {fixture && usesClips ? (
          <>
            {playerApp ? (
              <div className="sm:col-span-2">
                <FormListboxField
                  name="clipAssetId"
                  label="Goal clip"
                  value={clip?.id ?? ""}
                  placeholder="Choose the goal clip"
                  disabled={busy || !eligible || !available}
                  onValueChange={setClipAssetId}
                  options={fixture.clips.map((row) => ({
                    value: row.id,
                    label: `Clip ${row.clipNumber}`,
                  }))}
                />
              </div>
            ) : (
              <label className="min-w-0 text-sm sm:col-span-2">
                Goal clip
                <select
                  name="clipAssetId"
                  required
                  value={clip?.id ?? ""}
                  onChange={(event) => setClipAssetId(event.target.value)}
                  disabled={busy || !eligible || !available}
                  className={field}
                >
                  <option value="">Choose the clip containing the goal</option>
                  {fixture.clips.map((row) => (
                    <option key={row.id} value={row.id}>
                      Clip {row.clipNumber}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {clip ? (
              <div className="sm:col-span-2 overflow-hidden rounded-2xl border border-white/10 bg-black">
                <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
                  Clip {clip.clipNumber}
                </div>
                <video
                  controls
                  preload="metadata"
                  playsInline
                  src={clip.videoUrl}
                  className="aspect-video w-full object-contain"
                />
              </div>
            ) : null}
          </>
        ) : fixture ? (
          <>
            <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
              {fixture.videoUrls.map((link, index) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-200 underline"
                >
                  Watch fixture video {index + 1} ↗
                </a>
              ))}
            </div>
            <label className="text-sm">
              Goal number in the match
              <input
                type="number"
                name="goalNumber"
                min={1}
                max={fixture.homeScore + fixture.awayScore}
                required
                disabled={busy || !eligible || !available}
                className={field}
              />
            </label>
          </>
        ) : null}

        <div className="min-w-0 text-sm">
          <FormListboxField
            name="scoringTeamId"
            label="Scoring team"
            value={scoringTeamId}
            options={
              fixture
                ? [
                    { value: fixture.homeTeamId, label: fixture.homeTeamName },
                    { value: fixture.awayTeamId, label: fixture.awayTeamName },
                  ]
                : []
            }
            placeholder="Choose the scoring team"
            disabled={busy || !eligible || !available || !fixture}
            onValueChange={(value) => {
              setScoringTeamId(value);
              setScorerTeamMemberId("");
            }}
          />
        </div>
        <div className="min-w-0 text-sm">
          <FormListboxField
            name="scorerTeamMemberId"
            label="Scorer"
            value={scorerTeamMemberId}
            options={scorerOptions}
            placeholder={
              scoringTeamId
                ? "Choose the scorer from the squad"
                : "Choose the scoring team first"
            }
            disabled={
              busy || !eligible || !available || !fixture || !scoringTeamId
            }
            onValueChange={setScorerTeamMemberId}
          />
          {scoringTeamId ? (
            scorerOptions.length ? (
              <p className="mt-2 text-xs leading-5 text-white/50">
                The scorer must be linked to this team’s SIXFL squad so their
                profile, photo, squad number and awards can stay attached
                correctly.
              </p>
            ) : (
              <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">
                No squad players are available for this team. Ask the captain to
                add the scorer to the SIXFL squad, then come back and nominate
                the goal.
              </p>
            )
          ) : null}
        </div>
        <button
          type="submit"
          disabled={
            busy ||
            !eligible ||
            !available ||
            !fixture ||
            !scoringTeamId ||
            !scorerTeamMemberId ||
            (usesClips && !clip)
          }
          className="self-end rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
        >
          {busy ? "Saving…" : "Submit nomination"}
        </button>
      </form>
      {!selected.fixtures.length ? (
        <p className="mt-3 text-sm text-white/60">
          Eligible matches appear when their result and SIXFL TV footage are
          available.
        </p>
      ) : null}
    </details>
  ) : null;

  return (
    <div className={playerApp ? "space-y-4" : "space-y-8"}>
      {playerApp ? (
        <nav
          aria-label="Goal of the Month sections"
          className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.06] p-1"
        >
          {(["nominees", "voting", "winners"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              onClick={() => {
                setAppTab(tab);
                setNominating(false);
              }}
              className={`min-h-11 rounded-xl px-2 text-sm font-bold ${activeTab === tab ? "bg-emerald-400 text-black" : "text-white/60"}`}
            >
              {tab === "nominees"
                ? "Nominees"
                : tab === "voting"
                  ? "Vote"
                  : "Winners"}
            </button>
          ))}
        </nav>
      ) : null}
      <div
        role={failed ? "alert" : "status"}
        aria-live="polite"
        className={
          feedback
            ? failed
              ? "text-sm text-red-200"
              : "text-sm text-emerald-100"
            : "sr-only"
        }
      >
        {feedback}
      </div>
      {error ? (
        <p role="alert" className="text-amber-200">
          {error}{" "}
          <button
            type="button"
            onClick={() => void refresh()}
            className="underline"
          >
            Refresh
          </button>
        </p>
      ) : null}
      {!eligible ? (
        <p className="rounded-xl border border-white/10 p-4 text-sm text-white/70">
          Anyone can watch. Nominations and voting need a verified SIXFL player
          or captain account.{" "}
          {!playerApp ? (
            <Link
              href="/login?callbackUrl=%2Fgoal-of-the-month"
              className="text-emerald-200 underline"
            >
              Sign in to take part
            </Link>
          ) : null}
        </p>
      ) : null}
      {!playerApp && data.legacy.votingMayBeOpen ? (
        <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-4 text-sm text-amber-100">
          The final weekly round is finishing on its original timetable. Its
          existing nominations and votes are preserved.{" "}
          <Link href="/goal-of-the-week?legacy=1" className="underline">
            Open the final weekly round and archive
          </Link>
          .
        </p>
      ) : null}

      {data.voting.open && (!playerApp || activeTab === "voting") ? (
        <section
          aria-labelledby="monthly-voting"
          className={
            playerApp
              ? "space-y-3"
              : "space-y-4 rounded-3xl border border-amber-300/25 bg-amber-400/5 p-5"
          }
        >
          <h2
            id="monthly-voting"
            className={playerApp ? "text-base font-bold" : "text-2xl font-bold"}
          >
            Vote for {data.voting.label}
          </h2>
          <p className="text-sm text-white/70">
            One vote per verified player. Voting closes{" "}
            {deadline(data.voting.closesAt)} UK time.
          </p>
          <div className={cardGrid}>
            {data.voting.candidates.map((goal) => (
              <GoalNomineeCard
                key={goal.id}
                goal={goal}
                compact={playerApp}
                actionLabel={
                  data.voting.selectedCandidateId === goal.id
                    ? "Your vote is saved"
                    : "Vote for this goal"
                }
                disabled={
                  busy ||
                  !eligible ||
                  data.voting.selectedCandidateId === goal.id
                }
                onAction={() =>
                  void save({ action: "vote", candidateId: goal.id })
                }
              />
            ))}
          </div>
          {!data.voting.candidates.length ? (
            <p>No goals reached this month’s ballot.</p>
          ) : null}
        </section>
      ) : null}

      {playerApp && activeTab === "voting" && !data.voting.open ? (
        <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/65">
          Voting opens from the 6th to the 12th after each month. Back your
          favourites in Nominees while nominations are open.
        </p>
      ) : null}

      {selected && (!playerApp || activeTab === "nominees") ? (
        <section
          aria-labelledby="monthly-nominees"
          className={
            playerApp
              ? "space-y-3"
              : "space-y-5 rounded-3xl border border-emerald-300/20 bg-white/[0.03] p-5 sm:p-6"
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="monthly-nominees"
                className={
                  playerApp ? "text-base font-bold" : "text-2xl font-bold"
                }
              >
                {selected.label}
                {!playerApp ? " — current nominees" : ""}
              </h2>
              <p className="mt-1 text-xs text-white/60">
                {playerApp ? "Closes" : "Nominate until"}{" "}
                {deadline(selected.closesAt)} UK time.
                {!playerApp ? " Goals qualify by match date." : ""}
              </p>
            </div>
            {data.nominations.length > 1 ? (
              playerApp ? (
                <FormListboxField
                  name="awardMonth"
                  label="Award month"
                  value={selected.key}
                  options={data.nominations.map((period) => ({
                    value: period.key,
                    label: period.label,
                  }))}
                  onValueChange={(value) => {
                    setMonth(value);
                    setFixtureId("");
                    setClipAssetId("");
                    setScoringTeamId("");
                    setScorerTeamMemberId("");
                  }}
                />
              ) : (
                <label className="text-sm">
                  Award month
                  <select
                    aria-label="Award month"
                    value={selected.key}
                    onChange={(event) => {
                      setMonth(event.target.value);
                      setFixtureId("");
                      setClipAssetId("");
                      setScoringTeamId("");
                      setScorerTeamMemberId("");
                    }}
                    className={field}
                  >
                    {data.nominations.map((period) => (
                      <option key={period.key} value={period.key}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            ) : null}
          </div>

          {playerApp ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/55">
                  {Math.max(
                    0,
                    selected.maxNominations - selected.usedNominations,
                  )}{" "}
                  nominations left
                </span>
                <button
                  type="button"
                  aria-expanded={nominating}
                  onClick={() => setNominating(!nominating)}
                  className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-bold text-black"
                >
                  {nominating ? "Back to goals" : "+ Nominate a goal"}
                </button>
              </div>
              <details className="text-xs text-white/55">
                <summary className="flex min-h-8 cursor-pointer items-center">
                  How it works
                </summary>
                <p className="pb-2 leading-5">
                  Back a goal or nominate a new clip. Each uses one of your{" "}
                  {selected.maxNominations} monthly nominations. The six
                  most-backed goals reach the vote. Goals qualify by match date.
                </p>
              </details>
              {nominating ? nominationForm : null}
            </>
          ) : (
            <p className="text-sm text-white/60">
              Nominate a new goal below, or back one that is already listed.
              Each different player who backs a goal adds to its nomination
              total and helps decide the six finalists. Backing a goal uses one
              of your three monthly nominations.
            </p>
          )}
          {!playerApp || !nominating ? (
            <div className={cardGrid}>
              {selected.candidates.map((goal) => (
                <GoalNomineeCard
                  key={goal.id}
                  goal={goal}
                  compact={playerApp}
                  onAction={() => backGoal(goal)}
                  actionLabel={
                    selected.nominatedCandidateIds.includes(goal.id)
                      ? "You backed this goal"
                      : "Back this goal"
                  }
                  disabled={
                    busy ||
                    !eligible ||
                    !available ||
                    selected.nominatedCandidateIds.includes(goal.id)
                  }
                />
              ))}
            </div>
          ) : null}
          {!selected.candidates.length && (!playerApp || !nominating) ? (
            <p className="rounded-xl border border-white/10 p-4 text-white/60">
              No nominations yet. Nominate a goal to get this month started.
            </p>
          ) : null}

          {!playerApp ? nominationForm : null}
        </section>
      ) : null}

      {playerApp && activeTab === "nominees" && !selected ? (
        <p className="rounded-2xl bg-white/5 p-4 text-sm text-white/65">
          Nominations are closed at the moment. Check Vote for the latest
          shortlist.
        </p>
      ) : null}

      {!playerApp || activeTab === "winners" ? (
        <section aria-labelledby="monthly-winners" className="space-y-4">
          <h2
            id="monthly-winners"
            className={playerApp ? "text-base font-bold" : "text-2xl font-bold"}
          >
            {playerApp ? "Monthly winners" : "Monthly winner archive"}
          </h2>
          <details className="text-xs text-white/60">
            <summary className="min-h-8 cursor-pointer">
              How winners are chosen
            </summary>
            <p>
              Voting closes after the 12th. A tied vote is decided by
              nominations, then the earliest nominee. A round with no votes has
              no player-voted winner.
            </p>
          </details>
          <div className={cardGrid}>
            {data.winners.map((goal) => (
              <GoalNomineeCard
                key={goal.id}
                goal={goal}
                compact={playerApp}
                winner
              />
            ))}
          </div>
          {!data.winners.length ? (
            <p className="text-sm text-white/60">
              The first monthly winner will appear after voting closes.
            </p>
          ) : null}
          {!playerApp ? (
            <Link
              href="/goal-of-the-week?legacy=1"
              className="inline-block text-sm text-emerald-200 underline"
            >
              View the original weekly winners and final weekly round
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
