"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import GoalNomineeCard, { type GoalNominee } from "./GoalNomineeCard";
import { useMonthlyGoals } from "./useMonthlyGoals";

function deadline(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(new Date(value).getTime() - 60000));
}
const field = "w-full min-w-0 rounded-xl border border-white/20 bg-[#101714] px-3 py-3 text-sm text-white";

export default function MonthlyGoalsPanel() {
  const { data, loading, error, refresh } = useMonthlyGoals();
  const [month, setMonth] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(payload: Record<string, unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setFeedback("Saving…"); setFailed(false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/goal-of-month/community", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save your selection.");
      setFeedback(payload.action === "vote" ? "Your vote is saved. You can change it before voting closes." : result.alreadyNominated ? "You have already nominated this goal." : "Nomination saved. The goal and its linked footage are now in the nominees.");
      await refresh();
    } catch (failure) {
      setFailed(true);
      setFeedback(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "The save could not be confirmed. Refresh to check your selection before trying again.");
    } finally { clearTimeout(timeout); inFlight.current = false; setBusy(false); }
  }
  const nominate = (goal: GoalNominee) => void save({ action: "nominate", fixtureId: goal.fixtureId, scoringTeamId: goal.teamId, goalNumber: goal.goalNumber, scorerName: goal.scorerName });
  if (loading && !data) return <p role="status" className="p-6 text-white/70">Loading Goal of the Month…</p>;
  if (!data) return <div className="rounded-2xl border border-red-300/20 p-6"><p role="alert">{error || "Competition unavailable."}</p><button type="button" onClick={() => void refresh()} className="mt-3 underline">Try again</button></div>;
  const selected = data.nominations.find(period => period.key === month) ?? data.nominations[0];
  const fixture = selected?.fixtures.find(row => row.id === fixtureId);
  const eligible = data.viewer.eligible;
  const available = selected ? selected.usedNominations < selected.maxNominations : false;
  return (
    <div className="space-y-8">
      <div role={failed ? "alert" : "status"} aria-live="polite" className={failed ? "text-red-200" : "text-emerald-100"}>{feedback}</div>
      {error ? <p role="alert" className="text-amber-200">{error} <button type="button" onClick={() => void refresh()} className="underline">Refresh</button></p> : null}
      {!eligible ? <p className="rounded-xl border border-white/10 p-4 text-sm text-white/70">Anyone can watch. Nominations and voting need a verified SIXFL player or captain account. <Link href="/login?callbackUrl=%2Fgoal-of-the-month" className="text-emerald-200 underline">Sign in to take part</Link></p> : null}
      {data.legacy.votingMayBeOpen ? <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-4 text-sm text-amber-100">The final weekly round is finishing on its original timetable. Its existing nominations and votes are preserved. <Link href="/goal-of-the-week?legacy=1" className="underline">Open the final weekly round and archive</Link>.</p> : null}
      {data.voting.open ? (
        <section aria-labelledby="monthly-voting" className="space-y-4 rounded-3xl border border-amber-300/25 bg-amber-400/5 p-5">
          <h2 id="monthly-voting" className="text-2xl font-bold">Vote for {data.voting.label}</h2>
          <p className="text-sm text-white/70">One vote per verified player. Voting closes {deadline(data.voting.closesAt)} UK time.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.voting.candidates.map(goal => <GoalNomineeCard key={goal.id} goal={goal} actionLabel={data.voting.selectedCandidateId === goal.id ? "Your vote is saved" : "Vote for this goal"} disabled={busy || !eligible || data.voting.selectedCandidateId === goal.id} onAction={() => void save({ action: "vote", candidateId: goal.id })} />)}</div>
          {!data.voting.candidates.length ? <p>No goals reached this month’s ballot.</p> : null}
        </section>
      ) : null}
      {selected ? (
        <section aria-labelledby="monthly-nominees" className="space-y-5 rounded-3xl border border-fuchsia-300/20 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 id="monthly-nominees" className="text-2xl font-bold">{selected.label} — current nominees</h2><p className="mt-2 text-sm text-white/60">Nominate until {deadline(selected.closesAt)} UK time. Goals qualify by match date.</p></div>
            {data.nominations.length > 1 ? <label className="text-sm">Award month<select aria-label="Award month" value={selected.key} onChange={event => { setMonth(event.target.value); setFixtureId(""); }} className={field}>{data.nominations.map(period => <option key={period.key} value={period.key}>{period.label}</option>)}</select></label> : null}
          </div>
          <p className="text-sm text-white/60">Watch the videos attached to each nominated fixture. Goal numbers identify the nominated moments; these links may contain match highlights rather than a separate goal-only clip.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{selected.candidates.map(goal => <GoalNomineeCard key={goal.id} goal={goal} onAction={() => nominate(goal)} actionLabel={selected.nominatedCandidateIds.includes(goal.id) ? "You nominated this goal" : "Nominate this goal"} disabled={busy || !eligible || !available || selected.nominatedCandidateIds.includes(goal.id)} />)}</div>
          {!selected.candidates.length ? <p className="rounded-xl border border-white/10 p-4 text-white/60">No nominations yet. Choose a goal below to get this month started.</p> : null}
          <details className="rounded-2xl border border-white/10 p-4" open>
            <summary className="cursor-pointer text-lg font-bold">Nominate a goal</summary>
            <p className="my-3 text-sm text-white/65">{selected.usedNominations} of {selected.maxNominations} nominations used for {selected.label}. Several nominations of the same goal share one card.</p>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={event => {
              event.preventDefault(); const values = new FormData(event.currentTarget);
              void save({ action: "nominate", fixtureId: values.get("fixtureId"), scoringTeamId: values.get("scoringTeamId"), goalNumber: values.get("goalNumber"), scorerName: values.get("scorerName") });
            }}>
              <label className="min-w-0 text-sm sm:col-span-2">Recorded fixture<select name="fixtureId" required value={fixture?.id ?? ""} onChange={event => setFixtureId(event.target.value)} disabled={busy || !eligible || !available} className={field}><option value="">Choose a recorded match</option>{selected.fixtures.map(row => <option key={row.id} value={row.id}>{row.homeTeamName} v {row.awayTeamName} · {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }).format(new Date(row.kickoffAt))}</option>)}</select></label>
              {fixture ? <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">{fixture.videoUrls.map((link, index) => <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="text-emerald-200 underline">Watch fixture video {index + 1} ↗</a>)}</div> : null}
              <label className="text-sm">Goal number in the match<input type="number" name="goalNumber" min={1} max={fixture ? fixture.homeScore + fixture.awayScore : 1} required disabled={busy || !eligible || !available || !fixture} className={field} /></label>
              <label className="min-w-0 text-sm">Scoring team<select key={fixture?.id ?? "none"} name="scoringTeamId" required disabled={busy || !eligible || !available || !fixture} className={field} defaultValue=""><option value="">Choose the scoring team</option>{fixture ? <><option value={fixture.homeTeamId}>{fixture.homeTeamName}</option><option value={fixture.awayTeamId}>{fixture.awayTeamName}</option></> : null}</select></label>
              <label className="text-sm">Scorer’s name (optional)<input name="scorerName" maxLength={100} disabled={busy || !eligible || !available} className={field} /></label>
              <button type="submit" disabled={busy || !eligible || !available || !fixture} className="self-end rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">{busy ? "Saving…" : "Submit nomination"}</button>
            </form>
            {!selected.fixtures.length ? <p className="mt-3 text-sm text-white/60">Eligible matches appear when their result and SIXFL TV footage are available.</p> : null}
          </details>
        </section>
      ) : null}
      <section aria-labelledby="monthly-winners" className="space-y-4">
        <h2 id="monthly-winners" className="text-2xl font-bold">Monthly winner archive</h2>
        <p className="text-sm text-white/60">Voting closes after the 12th. A tied vote is decided by nominations, then the earliest nominee. A round with no votes has no player-voted winner.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.winners.map(goal => <GoalNomineeCard key={goal.id} goal={goal} winner />)}</div>
        {!data.winners.length ? <p className="text-sm text-white/60">The first monthly winner will appear after voting closes.</p> : null}
        <Link href="/goal-of-the-week?legacy=1" className="inline-block text-sm text-emerald-200 underline">View the original weekly winners and final weekly round</Link>
      </section>
    </div>
  );
}
