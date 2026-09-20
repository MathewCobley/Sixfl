"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Kind = "HIGHLIGHTS" | "HIGHLIGHTS_ALT" | "FULL_MATCH";
type Render = { id: string; kind: Kind; state: "QUEUED" | "PROCESSING" | "READY" | "FAILED"; createdAt: string; completedAt: string | null; error: string | null; sizeBytes: number | null; durationMs: number | null; progressPercent: number; progressLabel: string; queueAhead: number | null };
type Thumbnail = { kind: Kind; headline: string; strapline: string; showScore: boolean; sizeBytes: number; updatedAt: string };
type Publish = { id: string; kind: Kind; state: "QUEUED" | "PROCESSING" | "READY" | "FAILED"; title: string; description: string; privacyStatus: "private" | "unlisted" | "public"; youtubeVideoId: string | null; youtubeUrl: string | null; error: string | null; createdAt: string; completedAt: string | null };
type YoutubeDefaults = { title: string; description: string };
type ThumbnailDraft = { headline: string; strapline: string; showScore: boolean };
type State = { renders: Render[]; thumbnails: Thumbnail[]; publishes: Publish[]; youtube: { configured: boolean; connected: boolean; channelId: string | null; channelTitle: string | null }; youtubeDefaults: Record<Kind, YoutubeDefaults> };

async function json<T>(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "SIXFL TV request failed.");
  return payload;
}
function sizeLabel(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
function kindLabel(kind: Kind) { return kind === "HIGHLIGHTS" ? "Highlights" : kind === "HIGHLIGHTS_ALT" ? "Highlights test style" : "Full match"; }
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40";
const stopButton = "inline-flex min-h-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40";
function renderActive(render: Render) { return render.state === "QUEUED" || render.state === "PROCESSING"; }
function renderStopped(render?: Render) { return render?.state === "FAILED" && /^Stopped by SIXFL admin\./.test(render.error || ""); }
function renderStateLabel(render?: Render) { return renderStopped(render) ? "STOPPED" : render?.state || "Not generated"; }

function ThumbnailEditor({ fixtureId, kind, current, busy, renderRevision, onDraftChange, onSaved }: { fixtureId: string; kind: Kind; current?: Thumbnail; busy: boolean; renderRevision?: string; onDraftChange: (kind: Kind, draft: ThumbnailDraft) => void; onSaved: () => Promise<void> }) {
  const [headline, setHeadline] = useState(current?.headline || (kind === "HIGHLIGHTS" ? "MATCH HIGHLIGHTS" : "FULL MATCH"));
  const [strapline, setStrapline] = useState(current?.strapline || "");
  const [showScore, setShowScore] = useState(current?.showScore ?? true);
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewSrc = useMemo(() => {
    const params = new URLSearchParams({
      preview: "1",
      headline,
      strapline,
      showScore: showScore ? "true" : "false",
      renderRevision: renderRevision || "",
    });
    return `/api/admin/sixfl-tv/studio/${encodeURIComponent(fixtureId)}/thumbnail/${kind}?${params.toString()}`;
  }, [fixtureId, kind, headline, strapline, showScore, renderRevision]);
  const [debouncedPreviewSrc, setDebouncedPreviewSrc] = useState(previewSrc);
  useEffect(() => {
    setPreviewFailed(false);
    const timer = window.setTimeout(() => setDebouncedPreviewSrc(previewSrc), 250);
    return () => window.clearTimeout(timer);
  }, [previewSrc]);
  useEffect(() => {
    onDraftChange(kind, { headline, strapline, showScore });
  }, [headline, strapline, showScore, kind, onDraftChange]);
  async function save() {
    if (saving || busy) return;
    setSaving(true); setError("");
    try {
      await json(`/api/admin/sixfl-tv/studio/${encodeURIComponent(fixtureId)}`, { action: "thumbnail", kind, headline, strapline, showScore });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Thumbnail could not be saved."); }
    finally { setSaving(false); }
  }
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-white">{kindLabel(kind)} thumbnail</h3>{current ? <span className="text-xs text-emerald-200">Saved</span> : <span className="text-xs text-white/45">Not saved yet</span>}</div>
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Live preview</span><span className="text-xs text-white/40">Updates as you type</span></div>
      {previewFailed ? <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-white/10 bg-black/40 px-6 text-center text-sm text-white/50">Thumbnail preview is temporarily unavailable. Your saved thumbnail is unaffected.</div> : <img key={debouncedPreviewSrc} src={debouncedPreviewSrc} alt={`${kindLabel(kind)} live thumbnail preview`} className="aspect-video w-full rounded-xl border border-white/10 bg-black object-cover" onLoad={() => setPreviewFailed(false)} onError={() => setPreviewFailed(true)} />}
      {current ? <p className="mt-2 text-xs text-white/40">The preview above shows your current fields. Your saved thumbnail stays unchanged until you press Save thumbnail.</p> : <p className="mt-2 text-xs text-white/40">This is a preview only. Nothing is saved or sent to YouTube until you press Save thumbnail and later approve the video.</p>}
    </div>
    <div className="mt-4 grid gap-3">
      <label className="text-sm text-white/70">Headline<input value={headline} maxLength={80} onChange={e => setHeadline(e.target.value)} className="mt-1 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-emerald-400/40" /></label>
      <label className="text-sm text-white/70">Strapline<input value={strapline} maxLength={120} onChange={e => setStrapline(e.target.value)} placeholder="League or match wording" className="mt-1 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-emerald-400/40" /></label>
      <label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={showScore} onChange={e => setShowScore(e.target.checked)} className="h-4 w-4 accent-emerald-400" /> Show saved final score</label>
      <button type="button" className={button} disabled={saving || busy || !headline.trim()} onClick={() => void save()}>{saving ? "Saving thumbnail…" : "Save thumbnail"}</button>
      {error ? <p role="alert" className="text-sm text-red-200">{error}</p> : null}
    </div>
  </section>;
}

function PublishEditor({ fixtureId, kind, render, thumbnailDraft, publish, defaults, connected, busy, onRefresh }: { fixtureId: string; kind: Kind; render?: Render; thumbnailDraft: ThumbnailDraft; publish?: Publish; defaults: YoutubeDefaults; connected: boolean; busy: boolean; onRefresh: () => Promise<void> }) {
  const [title, setTitle] = useState(publish?.title || defaults.title);
  const [description, setDescription] = useState(publish?.description || defaults.description);
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  const ready = render?.state === "READY" && Boolean(thumbnailDraft.headline.trim());
  const active = publish?.state === "QUEUED" || publish?.state === "PROCESSING";
  async function approve() {
    if (!connected || !ready || active || sending || busy) return;
    setSending(true); setError("");
    try {
      await json(`/api/admin/sixfl-tv/studio/${encodeURIComponent(fixtureId)}`, {
        action: "publish",
        confirmed: true,
        kind,
        title,
        description,
        headline: thumbnailDraft.headline,
        strapline: thumbnailDraft.strapline,
        showScore: thumbnailDraft.showScore,
      });
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : "YouTube upload could not be queued."); }
    finally { setSending(false); }
  }
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-white">{kindLabel(kind)} → YouTube</h3><span className="text-xs text-white/50">{publish ? publish.state : "Not uploaded"}</span></div>
    {publish?.state === "READY" && publish.youtubeUrl ? <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-100"><p>Published publicly on YouTube and saved against this fixture.</p><a href={publish.youtubeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block underline underline-offset-4">Open on YouTube</a></div> : null}
    {publish?.state === "FAILED" ? <p role="alert" className="mt-3 text-sm text-red-200">{publish.error || "YouTube upload failed. Review the error before approving another attempt."}</p> : null}
    {active ? <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm leading-6 text-emerald-100">
      <p>{publish?.state === "QUEUED" ? "Waiting for the SIXFL TV worker." : "Publishing the approved video and thumbnail publicly on YouTube."}</p>
      <p className="mt-1 text-emerald-100/75"><strong>Publishing continues in the background.</strong> You can leave this page, open another fixture or use the rest of SIXFL Admin while it finishes.</p>
      <a href="/admin/sixfl-tv/fixtures" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/15">Choose another fixture</a>
    </div> : null}
    <div className="mt-4 grid gap-3">
      <label className="text-sm text-white/70">YouTube title <span className="text-white/40">(optional)</span><input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="Automatic title" className="mt-1 block w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-emerald-400/40" /></label>
      <label className="text-sm text-white/70">Description <span className="text-white/40">(optional)</span><textarea value={description} maxLength={5000} rows={4} onChange={e => setDescription(e.target.value)} placeholder="Automatic description" className="mt-1 block w-full resize-y rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-emerald-400/40" /></label>
      <p className="text-xs leading-5 text-amber-100/75">Ready SIXFL TV videos now publish automatically as <strong>Public</strong> on YouTube once the confirmed result, finished render and thumbnail are ready. The first SIXFL TV video published each UK calendar day notifies subscribers; later uploads that day publish normally without another subscriber notification. Use the button below only as a manual fallback or retry.</p>
      <button type="button" className={button} disabled={!connected || !ready || active || sending || busy} onClick={() => void approve()}>{sending ? "Queuing…" : active ? "Upload in progress…" : "Publish / retry now"}</button>
      {!render || render.state !== "READY" ? <p className="text-xs text-white/45">Generate and review the finished {kindLabel(kind).toLowerCase()} preview first.</p> : !thumbnailDraft.headline.trim() ? <p className="text-xs text-white/45">Add the thumbnail headline first.</p> : !connected ? <p className="text-xs text-white/45">Connect the SIXFL YouTube channel first.</p> : null}
      {error ? <p role="alert" className="text-sm text-red-200">{error}</p> : null}
    </div>
  </section>;
}

export default function StudioControls({ fixtureId, initial }: { fixtureId: string; initial: State }) {
  const [state, setState] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const initialThumbs = new Map(initial.thumbnails.map(thumb => [thumb.kind, thumb]));
  const [thumbnailDrafts, setThumbnailDrafts] = useState<Record<Exclude<Kind, "HIGHLIGHTS_ALT">, ThumbnailDraft>>({
    HIGHLIGHTS: {
      headline: initialThumbs.get("HIGHLIGHTS")?.headline || "MATCH HIGHLIGHTS",
      strapline: initialThumbs.get("HIGHLIGHTS")?.strapline || "",
      showScore: initialThumbs.get("HIGHLIGHTS")?.showScore ?? true,
    },
    FULL_MATCH: {
      headline: initialThumbs.get("FULL_MATCH")?.headline || "FULL MATCH",
      strapline: initialThumbs.get("FULL_MATCH")?.strapline || "",
      showScore: initialThumbs.get("FULL_MATCH")?.showScore ?? true,
    },
  });
  const updateThumbnailDraft = useCallback((kind: Exclude<Kind, "HIGHLIGHTS_ALT">, draft: ThumbnailDraft) => {
    setThumbnailDrafts(current => {
      const previous = current[kind];
      if (
        previous.headline === draft.headline &&
        previous.strapline === draft.strapline &&
        previous.showScore === draft.showScore
      ) {
        return current;
      }
      return { ...current, [kind]: draft };
    });
  }, []);
  const endpoint = `/api/admin/sixfl-tv/studio/${encodeURIComponent(fixtureId)}`;
  const activeRenders = useMemo(() => state.renders.filter(renderActive), [state.renders]);
  const hasReadyPreview = useMemo(() => state.renders.some(render => render.state === "READY"), [state.renders]);
  const activePublishes = useMemo(() => state.publishes.filter(publish => publish.state === "QUEUED" || publish.state === "PROCESSING"), [state.publishes]);
  const active = useMemo(() => activeRenders.length > 0 || activePublishes.length > 0, [activeRenders.length, activePublishes.length]);
  async function refresh() { setState(await json<State>(endpoint)); }
  useEffect(() => {
    if (!active) return;
    const publishingOnly = activeRenders.length === 0 && activePublishes.length > 0;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), publishingOnly ? 15000 : 5000);
    return () => window.clearInterval(timer);
  }, [active, activeRenders.length, activePublishes.length, endpoint]);
  async function generate(kind?: Kind) {
    if (busy || activeRenders.length > 0) return;
    const previousRenders = state.renders;
    const target = kind ? kindLabel(kind).toLowerCase() : "video previews";
    setBusy(true); setError(""); setMessage(kind ? `Regenerating ${target} only…` : "Regenerating private video previews…");
    // Hide only the preview being regenerated. The other completed video stays
    // visible so a one-sided change does not make both versions look stale.
    setState(current => ({
      ...current,
      renders: current.renders.map(render =>
        render.state === "READY" && (!kind || render.kind === kind)
          ? { ...render, state: "QUEUED" as const, completedAt: null, error: null, sizeBytes: null, durationMs: null, progressPercent: 0, progressLabel: "Queuing fresh render" }
          : render,
      ),
    }));
    try {
      await json(endpoint, { action: "render", ...(kind ? { kind } : {}) });
      await refresh();
      setMessage(kind
        ? `Fresh ${target} preview queued. The other finished preview has not been changed.`
        : "Fresh preview jobs queued. Old previews stay hidden until the new versions are ready.");
    } catch (e) {
      try { await refresh(); } catch { setState(current => ({ ...current, renders: previousRenders })); }
      setError(e instanceof Error ? e.message : "Preview could not be queued.");
    } finally { setBusy(false); }
  }
  async function stopRendering(kind?: Kind) {
    if (busy) return;
    setBusy(true); setError(""); setMessage(kind ? `Stopping ${kindLabel(kind).toLowerCase()} render…` : "Stopping active renders…");
    try {
      const result = await json<{ stopped: Render[] }>(endpoint, { action: "cancel-render", ...(kind ? { kind } : {}) });
      await refresh();
      setMessage(result.stopped.length ? "Rendering stopped. Uploaded source footage and any earlier finished preview are unchanged." : "No active render was found to stop.");
    } catch (e) { setError(e instanceof Error ? e.message : "Rendering could not be stopped."); }
    finally { setBusy(false); }
  }
  const renderByKind = new Map(state.renders.map(render => [render.kind, render]));
  const thumbByKind = new Map(state.thumbnails.map(thumb => [thumb.kind, thumb]));
  const publishByKind = new Map(state.publishes.map(publish => [publish.kind, publish]));
  return <div className="space-y-6">
    {activePublishes.length ? <section className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong>YouTube publishing is running in the background.</strong>
          <p className="mt-1 text-emerald-100/75">You do not need to keep this match open. All other SIXFL TV and Admin controls remain available while {activePublishes.map(publish => kindLabel(publish.kind).toLowerCase()).join(" and ")} finishes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/sixfl-tv/fixtures" className={button}>Choose another fixture</a>
          <a href="/admin" className={button}>Back to Admin</a>
        </div>
      </div>
    </section> : null}
    <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-white">Create SIXFL TV videos</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">Uses the source files already saved for this fixture. Highlights use your saved individual clips in their chosen order (falling back to a ready-made highlights file only when there are no clips). The full match uses the separate full-match upload. Shared intro/outro, the real SIXFL TV logo, saved badges, final score, recorded scorers, pre-match form, saved matchday squads and any stored pre-match SIXFL Predictor score are added by the renderer. You can regenerate both together here, or update just Highlights or just Full match from its own preview card below.</p></div>{activeRenders.length ? <button type="button" className={stopButton} disabled={busy} onClick={() => void stopRendering()}>{busy ? "Stopping…" : "Stop rendering"}</button> : <button type="button" className={button} disabled={busy} onClick={() => void generate()}>{busy ? "Queuing…" : hasReadyPreview ? "Regenerate all previews" : "Generate all previews"}</button>}</div>
      {message ? <p role="status" className="mt-4 text-sm text-emerald-100">{message}</p> : null}{error ? <p role="alert" className="mt-4 text-sm text-red-200">{error}</p> : null}
    </section>
    <div className="grid gap-4 lg:grid-cols-3">{(["HIGHLIGHTS", "HIGHLIGHTS_ALT", "FULL_MATCH"] as Kind[]).map(kind => {
      const render = renderByKind.get(kind);
      return <section key={kind} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-white">{kindLabel(kind)} preview</h3><span className="text-xs text-white/50">{renderStateLabel(render)}</span></div>
        {render?.state === "READY" ? <><video controls preload="metadata" playsInline src={`${endpoint}/render/${encodeURIComponent(render.id)}`} className="mt-4 aspect-video w-full rounded-xl bg-black"/><div className="mt-3 flex flex-wrap gap-2"><a className={button} href={`${endpoint}/render/${encodeURIComponent(render.id)}?download=1`}>Download preview</a><span className="self-center text-xs text-white/45">{sizeLabel(render.sizeBytes)}{render.durationMs ? ` · ${Math.round(render.durationMs / 1000)} sec` : ""}</span></div></> : null}{kind === "HIGHLIGHTS_ALT" ? <p className="mt-3 text-xs leading-5 text-amber-100/75">Test only — uses the same real highlight footage and saved team badges, but does not replace or publish the normal highlights video.</p> : null}
        {renderStopped(render) ? <p role="status" className="mt-3 text-sm text-amber-100">Rendering stopped. Your uploaded footage is unchanged; you can generate a fresh preview whenever you are ready.</p> : render?.state === "FAILED" ? <p role="alert" className="mt-3 text-sm text-red-200">{render.error || "Rendering failed. Generate previews again after checking the source files."}</p> : null}
        {render && renderActive(render) ? <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-white/65">{render.progressLabel || (render.state === "QUEUED" ? "Waiting for the video worker" : "Rendering video")}</span>
            <span className="shrink-0 font-semibold tabular-nums text-emerald-200">{Math.max(0, Math.min(99, render.progressPercent))}%</span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-white/[0.06]"
            role="progressbar"
            aria-label={`${kindLabel(kind)} render progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(0, Math.min(99, render.progressPercent))}
          >
            <div
              className="h-full rounded-full bg-emerald-400 transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(2, Math.min(99, render.progressPercent))}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-white/45">
              {render.state === "QUEUED"
                ? render.queueAhead === 0
                  ? "Next to start."
                  : render.queueAhead === 1
                    ? "1 render ahead in the queue."
                    : typeof render.queueAhead === "number"
                      ? `${render.queueAhead} renders ahead in the queue.`
                      : "Waiting to start."
                : "Rendering privately. Original match sound is retained."}
            </p>
            <button type="button" className={stopButton} disabled={busy} onClick={() => void stopRendering(kind)}>{busy ? "Stopping…" : `Stop ${kindLabel(kind).toLowerCase()}`}</button>
          </div>
        </div> : null}
        {!render ? <p className="mt-3 text-sm text-white/50">No preview generated yet.</p> : null}
        {(!render || !renderActive(render)) ? <div className="mt-4"><button type="button" className={button} disabled={busy || activeRenders.length > 0} onClick={() => void generate(kind)}>{busy ? "Queuing…" : render?.state === "READY" ? `Regenerate ${kindLabel(kind)} only` : `Generate ${kindLabel(kind)} only`}</button></div> : null}
      </section>;
    })}</div>
    <div><h2 className="mb-3 text-xl font-bold text-white">YouTube thumbnails</h2><div className="grid gap-4 lg:grid-cols-2">{(["HIGHLIGHTS", "FULL_MATCH"] as Kind[]).map(kind => {
      const render = renderByKind.get(kind);
      return <ThumbnailEditor
        key={`${kind}-${thumbByKind.get(kind)?.updatedAt || "new"}-${render?.completedAt || render?.id || "no-render"}`}
        fixtureId={fixtureId}
        kind={kind}
        current={thumbByKind.get(kind)}
        busy={busy}
        renderRevision={render?.completedAt || render?.id}
        onDraftChange={updateThumbnailDraft}
        onSaved={refresh}
      />;
    })}</div></div>
    <section className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/60"><strong className="text-white/85">YouTube connection</strong><br/>{state.youtube.connected ? <>Connected{state.youtube.channelTitle ? ` to ${state.youtube.channelTitle}` : ""}. Ready videos publish automatically; the controls below remain available for manual retry or correction.</> : state.youtube.configured ? <>The shared SIXFL YouTube connection is not authorised yet. <a className="ml-1 font-semibold text-emerald-300 underline underline-offset-4" href="/admin/sixfl-tv/settings">Manage YouTube from SIXFL TV</a>.</> : <>Google OAuth credentials are not configured yet. Preview generation and thumbnail editing still work without Google. <a className="ml-1 font-semibold text-emerald-300 underline underline-offset-4" href="/admin/sixfl-tv/settings">Open SIXFL TV setup</a>.</>}</section>
    <div><h2 className="mb-3 text-xl font-bold text-white">Review & publish</h2><div className="grid gap-4 lg:grid-cols-2">{(["HIGHLIGHTS", "FULL_MATCH"] as Kind[]).map(kind => <PublishEditor key={`${kind}-${publishByKind.get(kind)?.id || "new"}`} fixtureId={fixtureId} kind={kind} render={renderByKind.get(kind)} thumbnailDraft={thumbnailDrafts[kind]} publish={publishByKind.get(kind)} defaults={state.youtubeDefaults[kind]} connected={state.youtube.connected} busy={busy} onRefresh={refresh} />)}</div></div>
  </div>;
}
