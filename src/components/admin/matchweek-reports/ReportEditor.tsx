"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportContent, ReportView } from "@/lib/matchweek-reports/types";
import NewsPublishingControls from "./NewsPublishingControls";
import ReportSkippedFixtures from "./ReportSkippedFixtures";

const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-black/40 p-3 text-base leading-7 text-white focus:border-emerald-400 focus:outline-none";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(`${date}T12:00:00Z`));
const stamp = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(new Date(date));

export default function ReportEditor({ slug, initialView }: { slug: string; initialView: ReportView }) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [content, setContent] = useState<ReportContent | null>(initialView.draft?.content ?? null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [date, setDate] = useState(initialView.source.matchDate);
  const dirty = Boolean(content && JSON.stringify(content) !== JSON.stringify(view.draft?.content));
  const endpoint = `/api/admin/matchweek-reports/${encodeURIComponent(slug)}`;
  const source = view.draft?.content ? view.draft.source! : view.source;
  const accept = (next: ReportView) => { setView(next); setContent(next.draft?.content ?? null); };

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function write(action: "generate" | "save") {
    if (busy) return;
    if (action === "generate" && dirty) { setError("Save or discard your edits before generating again."); return; }
    if (action === "generate" && content && !window.confirm("Generate a new OpenAI draft? This uses API credits and saves a new version. Previous saved versions are retained.")) return;
    setBusy(action); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Sixfl-Report": "1" },
        body: JSON.stringify({ action, requestId: crypto.randomUUID(), matchDate: view.source.matchDate, baseVersion: view.draft?.version ?? 0, sourceHash: view.sourceHash, ...(action === "save" ? { content } : {}) }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.view) throw new Error(payload.error || "The outcome could not be confirmed. Check saved status before trying again.");
      accept(payload.view); setEditing(false);
      setNotice(action === "generate" ? "OpenAI report generated and saved as a private draft. Review it before using it." : "Your edited draft has been saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Connection lost. Your text is kept. Check saved status before trying again."); }
    finally { setBusy(null); }
  }
  async function checkSaved() {
    setBusy("check"); setError(""); setNotice("");
    try {
      const response = await fetch(`${endpoint}?date=${view.source.matchDate}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.view) throw new Error(payload.error || "Could not check saved status.");
      if (dirty && JSON.stringify(payload.view.draft?.content) !== JSON.stringify(content) && !window.confirm("Your on-screen edits differ from the saved draft. Replace them with the saved version? Cancel to keep your edits.")) return;
      accept(payload.view); setEditing(false);
      setNotice(payload.view.generating ? "OpenAI is still generating this report. Check saved status again shortly." : payload.view.draft?.content ? "Loaded the saved draft. No OpenAI request was made." : "No generated draft has been saved yet.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not check saved status."); }
    finally { setBusy(null); }
  }
  function update(key: "title" | "introduction" | "closing", text: string) {
    setContent(c => c ? { ...c, [key]: text } : c);
  }
  const totalGoals = view.source.matches.reduce((n, m) => n + m.scoreA + m.scoreB, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Editorial desk · Admin only</p>
        <h1 className="mt-3 text-3xl font-black text-white">{view.source.leagueName}</h1>
        <p className="mt-3 text-white/65">{dateLabel(view.source.matchDate)} · {view.source.matches.length} included results · {totalGoals} goals</p>
        <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (!dirty || window.confirm("Leave this night and discard unsaved edits?")) router.push(`/admin/matchweek-reports/${encodeURIComponent(slug)}?date=${date}`); }}>
          <label className="text-sm font-semibold text-white/75">Match night<input aria-label="Match night" type="date" required value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></label>
          <button className={buttonClass} disabled={Boolean(busy)}>Load night</button>
        </form>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => write("generate")} disabled={Boolean(busy) || view.generating || dirty || !view.configured || !view.source.matches.length} className={`${buttonClass} bg-emerald-400 !text-black hover:!bg-emerald-300`}>
            {busy === "generate" ? "OpenAI is writing…" : content ? "Regenerate with OpenAI" : "Generate report with OpenAI"}
          </button>
          {content && !editing ? <button type="button" className={buttonClass} disabled={Boolean(busy)} onClick={() => setEditing(true)}>Edit report</button> : null}
          {editing ? <>
            <button type="button" className={buttonClass} disabled={Boolean(busy) || !dirty} onClick={() => write("save")}>{busy === "save" ? "Saving…" : "Save draft"}</button>
            <button type="button" className={buttonClass} disabled={Boolean(busy)} onClick={() => { if (!dirty || window.confirm("Discard your unsaved edits?")) { setContent(view.draft?.content ?? null); setEditing(false); } }}>Cancel editing</button>
          </> : null}
          <button type="button" onClick={checkSaved} disabled={Boolean(busy)} className={buttonClass}>Check saved status</button>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/65">Generating and saving do not publish your report. OpenAI runs only when you press Generate. Each generation uses API credits; viewing and editing saved drafts do not. Check names, scores and wording before using the article.</p>
        {!view.configured ? <p className="mt-3 text-amber-200">OpenAI setup is missing. Add OPENAI_API_KEY to the SIXFL service in Railway; never paste the key into a report.</p> : null}
        {view.generating ? <p className="mt-3 text-amber-200">A generation is in progress. Use Check saved status to retrieve it; do not start another.</p> : null}
        {view.latestError ? <p className="mt-3 text-amber-200">Last generation: {view.latestError}</p> : null}
        {view.stale ? <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-500/10 p-3 text-amber-100">The recorded results have changed since this draft was generated. The article and its scorecards still show its saved source snapshot. Review the current facts below and regenerate before using it.</p> : null}
        {dirty ? <p className="mt-3 font-semibold text-amber-200">Unsaved changes — save your draft before leaving.</p> : null}
        {notice ? <p role="status" className="mt-3 text-emerald-200">{notice}</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-red-100">{error}</p> : null}
      </section>

      <ReportSkippedFixtures source={view.source} />
      <NewsPublishingControls slug={slug} date={view.source.matchDate} draftVersion={view.draft?.version ?? 0} sourceHash={view.sourceHash} blocked={Boolean(busy) || view.generating || dirty} stale={view.stale} />

      {content ? <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">SIXFL Matchnight · Private draft</p>
        <p className="mt-2 text-xs text-white/50">OpenAI · {view.draft?.model} · Version {view.draft?.version} · Saved {view.draft ? stamp(view.draft.updatedAt) : ""}</p>
        {editing ? <label className="mt-6 block font-semibold text-white">Headline<input maxLength={180} value={content.title} onChange={e => update("title", e.target.value)} className={inputClass} /></label> : <h2 className="mt-5 max-w-4xl text-3xl font-black leading-tight text-white sm:text-4xl">{content.title}</h2>}
        {editing ? <label className="mt-6 block font-semibold text-white">Opening paragraph<textarea rows={5} maxLength={3500} value={content.introduction} onChange={e => update("introduction", e.target.value)} className={inputClass} /></label> : <p className="mt-6 whitespace-pre-line text-lg leading-8 text-white/80">{content.introduction}</p>}
        <div className="mt-8 space-y-8">
          {content.matches.map((m, i) => {
            const f = source.matches.find(f => f.fixtureId === m.fixtureId);
            if (!f) return null;
            return <section key={m.fixtureId} className="border-t border-white/10 pt-6">
              <h3 className="text-xl font-bold leading-8 text-white">{f.teamA} <span className="whitespace-nowrap text-emerald-200">{f.scoreA}–{f.scoreB}</span> {f.teamB}</h3>
              {editing ? <label className="mt-3 block text-sm font-semibold text-white/70">Match paragraph<textarea rows={4} maxLength={3500} value={m.paragraph} onChange={e => setContent(c => c ? { ...c, matches: c.matches.map((old, j) => j === i ? { ...old, paragraph: e.target.value } : old) } : c)} className={inputClass} /></label> : <p className="mt-3 whitespace-pre-line text-base leading-8 text-white/75">{m.paragraph}</p>}
            </section>;
          })}
        </div>
        {editing ? <label className="mt-8 block font-semibold text-white">Closing paragraph (optional)<textarea rows={3} maxLength={2000} value={content.closing} onChange={e => update("closing", e.target.value)} className={inputClass} /></label> : content.closing ? <p className="mt-8 whitespace-pre-line border-t border-white/10 pt-6 text-base leading-8 text-white/75">{content.closing}</p> : null}
      </article> : <div className="rounded-3xl border border-dashed border-white/20 p-8 text-white/65"><h2 className="text-xl font-bold text-white">{view.source.matches.length ? "Ready for a proper match-night story" : "No eligible completed results on this date"}</h2><p className="mt-3 leading-7">{view.source.matches.length ? "Generate a headline, an opening and varied match paragraphs from these results. The report will be saved here for review and editing." : "Choose another match night, or finish recording the results first."}</p></div>}

      <details className="rounded-2xl border border-white/10 p-5 text-white/70">
        <summary className="cursor-pointer font-bold text-white">Current source facts ({view.source.matches.length} results)</summary>
        <p className="mt-3 text-sm leading-6">Only these results, recorded scorers and team-specific Player of the Match names are sent. No email addresses, phone numbers, payment data, private notes or league-table claims are included.</p>
        {view.source.matches.map(f => <div key={f.fixtureId} className="mt-4 border-t border-white/10 pt-4"><p className="font-semibold text-white">{f.teamA} {f.scoreA}–{f.scoreB} {f.teamB}</p>{f.scorers.length ? <p className="mt-2 text-sm">Recorded scorers: {f.scorers.map(s => `${s.name} (${s.team}, ${s.goals})`).join("; ")}</p> : null}{f.playersOfMatch.length ? <p className="mt-2 text-sm">Player of the Match: {f.playersOfMatch.map(p => `${p.name} (${p.team})`).join("; ")}</p> : null}</div>)}
      </details>
    </div>
  );
}
