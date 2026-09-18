"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FOOTAGE_LIMITS, footageSpec, type FootageKind } from "@/lib/sixfl-tv/footage-policy";
import type { footageState } from "@/lib/sixfl-tv/footage";
import { useFootageUploads } from "./FootageUploadProvider";
import { uploadPending, type UploadSelection } from "./footage-upload-queue";
type State = Awaited<ReturnType<typeof footageState>>;
type Asset = State["assets"][number];
const labels: Record<FootageKind, string> = { CLIP: "Highlight clips", HIGHLIGHTS: "Ready-made highlights", FULL_MATCH: "Full match", INTRO: "SIXFL TV intro", OUTRO: "SIXFL TV outro" };
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
function sizeLabel(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
async function json<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session may have expired. Sign in again, then resume the upload.");
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The footage request failed.");
  return value as T;
}
export default function FootageUploader({ fixtureId, fixtureLabel = "Match footage", initial, sharedOnly = false }: { fixtureId?: string; fixtureLabel?: string; initial: State; sharedOnly?: boolean }) {
  const { queue, snapshot } = useFootageUploads();
  const [state, setState] = useState(initial);
  const [selection, setSelection] = useState<UploadSelection[]>([]);
  const [localBusy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Asset | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Asset | null>(null);
  const running = useRef(false);
  const uploadScope = sharedOnly ? null : fixtureId || null;
  const displayLabel = sharedOnly ? "Shared SIXFL TV branding" : fixtureLabel;
  const endpoint = sharedOnly
    ? "/api/admin/sixfl-tv/footage/shared"
    : `/api/admin/sixfl-tv/footage/${encodeURIComponent(fixtureId || "")}`;
  const mediaUrl = (asset: Asset) => `${endpoint}/${encodeURIComponent(asset.id)}`;
  const refresh = useCallback(async () => { setState(await json<State>(endpoint)); }, [endpoint]);
  const tasks = snapshot.tasks.filter(task => task.fixtureId === uploadScope);
  const active = tasks.find(task => task.status === "UPLOADING");
  const latest = active || tasks.at(-1);
  const busy = localBusy || tasks.some(task => task.status === "UPLOADING" || task.status === "QUEUED");
  // Shared intro/outro and clip order must not change while this tab retains queued inputs.
  const mutationBusy = localBusy || snapshot.tasks.some(uploadPending);
  useEffect(() => {
    let mounted = true;
    void json<State>(endpoint).then(value => { if (mounted) setState(value); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [endpoint, snapshot.revision]);
  useEffect(() => {
    if (!localBusy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [localBusy]);
  function choose(files: FileList | null, kind: FootageKind, asset?: Asset) {
    if (!files || running.current || busy) return;
    try {
      const added = Array.from(files).map(file => {
        footageSpec({ kind, filename: file.name, sizeBytes: file.size, lastModified: file.lastModified });
        if (asset && (file.name !== asset.filename || file.size !== asset.sizeBytes)) throw new Error("Choose the same filename and size as the incomplete upload.");
        return { file, kind, asset };
      });
      if (kind === "CLIP" && added.length > 50) throw new Error("Choose no more than 50 clips at once.");
      // Selecting a full match must not silently discard already selected clips.
      setSelection(current => [...current.filter(item => item.kind !== kind), ...added]);
      setError(""); setMessage("Selection updated. Click Upload selected files to start.");
    } catch (e) { setError(e instanceof Error ? e.message : "Choose an MP4 file."); }
  }
  function upload() {
    if (busy || running.current || !selection.length) return;
    try {
      if (!sharedOnly && !fixtureId) throw new Error("Choose a fixture before uploading match footage.");
      const added = queue.enqueue(uploadScope, displayLabel, selection);
      setError(""); setMessage(added ? "" : "These files are already in the background queue. Use Resume upload for paused files.");
      if (added) setSelection([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not queue the upload."); }
  }
  async function move(asset: Asset, direction: -1 | 1) {
    if (running.current || mutationBusy) return;
    const ids = state.assets.filter(a => a.kind === "CLIP" && ["READY", "UPLOADING"].includes(a.state)).map(a => a.id);
    const index = ids.indexOf(asset.id), next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const ordered = [...ids]; [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    running.current = true; setBusy(true); setError("");
    try { await json(endpoint, { action: "reorder", ids: ordered, expectedIds: ids }); await refresh(); setMessage("Clip order saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Order could not be saved."); }
    finally { running.current = false; setBusy(false); }
  }
  async function remove(asset: Asset) {
    if (running.current || mutationBusy) return;
    running.current = true; setBusy(true); setError(""); setRemoveTarget(null);
    if (preview?.id === asset.id) setPreview(null);
    try {
      for (;;) {
        setMessage(`Removing ${asset.filename} from private storage…`);
        const result = await json<{ removed: boolean }>(endpoint, { action: "remove", assetId: asset.id, confirmed: true });
        if (result.removed) break;
      }
      await refresh(); setMessage("Source file removed. Published video links are unchanged.");
    } catch (e) { setError(e instanceof Error ? e.message : "Removal was interrupted. Use Continue removal to retry."); }
    finally { running.current = false; setBusy(false); await refresh().catch(() => undefined); }
  }
  function picker(kind: FootageKind, help: string) {
    const selected = selection.filter(item => item.kind === kind);
    return <label className="block cursor-pointer rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <span className="block text-lg font-semibold text-white">{labels[kind]}</span>
      <span className="mt-2 block text-sm leading-6 text-white/60">{help} MP4 only; up to {sizeLabel(FOOTAGE_LIMITS[kind])} per file.</span>
      <input aria-label={`Choose ${labels[kind].toLowerCase()}`} type="file" accept="video/mp4,.mp4" multiple={kind === "CLIP"} disabled={busy || !state.configured}
        className="sr-only"
        onChange={event => { choose(event.currentTarget.files, kind); event.currentTarget.value = ""; }} />
      <span className="mt-4 flex flex-wrap items-center gap-3">
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black">
          {selected.length ? (kind === "CLIP" ? "Change selected clips" : "Change selected file") : (kind === "CLIP" ? "Choose clips" : "Choose file")}
        </span>
        <span className={`min-w-0 break-words text-sm ${selected.length ? "font-semibold text-emerald-200" : "text-white/45"}`}>
          {selected.length ? selected.map(item => item.file.name).join(" · ") : "Nothing selected yet"}
        </span>
      </span>
    </label>;
  }
  function rows(assets: Asset[]) {
    return assets.map((asset, index) => <div key={asset.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="break-words font-semibold text-white">{asset.kind === "CLIP" ? `${index + 1}. ` : ""}{asset.filename}</p>
          <p className="mt-1 text-sm text-white/60">{labels[asset.kind]} · {sizeLabel(asset.sizeBytes)} · {asset.state === "READY" ? "Uploaded — private source" : asset.state === "DELETING" ? "Removal incomplete" : "Upload incomplete"}</p></div>
        <div className="flex flex-wrap gap-2">
          {asset.state === "READY" ? <><button type="button" className={button} onClick={() => setPreview(asset)}>Preview source</button><a className={button} href={`${mediaUrl(asset)}?download=1`}>Download source</a></> : null}
          {asset.kind === "CLIP" && asset.state !== "DELETING" ? <><button type="button" aria-label={`Move ${asset.filename} up`} disabled={mutationBusy || index === 0} onClick={() => void move(asset, -1)} className={button}>↑</button><button type="button" aria-label={`Move ${asset.filename} down`} disabled={mutationBusy || index === assets.length - 1} onClick={() => void move(asset, 1)} className={button}>↓</button></> : null}
          <button type="button" className={button} disabled={mutationBusy} onClick={() => setRemoveTarget(asset)}>{asset.state === "DELETING" ? "Continue removal" : "Remove"}</button>
        </div>
      </div>
      {asset.state === "UPLOADING" ? <label className="block cursor-pointer text-sm text-white/70">Resume: choose the same MP4 file
        <input aria-label={`Resume ${asset.filename}`} type="file" accept="video/mp4,.mp4" disabled={busy} className="sr-only"
          onChange={event => { choose(event.currentTarget.files, asset.kind, asset); event.currentTarget.value = ""; }} />
        <span className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-black">Choose file to resume</span>
      </label> : null}
    </div>);
  }
  const progress = active ? Math.min(100, Math.round(active.uploadedBytes / active.sizeBytes * 100)) : 0;
  const visibleMessage = message || latest?.message;
  const visibleError = error || latest?.error;

  if (sharedOnly) {
    return <div className="space-y-5 pb-20">
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm leading-6 text-emerald-100">
        <strong>Shared SIXFL TV branding.</strong> Upload the intro and outro once here. They are then available to every match render. Uploads continue in the background while you use other admin pages; keep this browser tab open.
      </div>
      {!state.configured ? <p role="alert" className="text-red-200">Private storage is not configured. Shared branding uploads are disabled.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {picker("INTRO", "Reusable SIXFL TV intro, available from every match.")}
        {picker("OUTRO", "Reusable SIXFL TV outro, available from every match.")}
      </div>
      {selection.length ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5">
        <p className="font-semibold text-white">Selected: {selection.length} file{selection.length === 1 ? "" : "s"} · {sizeLabel(selection.reduce((sum, s) => sum + s.file.size, 0))}</p>
        <p className="mt-2 break-words text-sm text-white/60">{selection.map(s => s.file.name).join(" · ")}</p>
        <div className="mt-4 flex gap-3"><button type="button" className={button} disabled={busy || !state.configured} onClick={upload}>Upload selected files</button><button type="button" className={button} disabled={busy} onClick={() => setSelection([])}>Clear selection</button></div>
      </div> : null}
      {active ? <div className="space-y-2"><progress aria-label="Current shared branding upload progress" value={progress} max={100} className="h-3 w-full accent-emerald-400" /><button type="button" className={button} onClick={() => queue.pause(active.id)}>Pause after current part</button></div> : null}
      {tasks.filter(task => task.status === "PAUSED" || task.status === "FAILED").map(task => <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3"><span className="break-words text-sm text-white/70">{task.filename}</span><button type="button" className={button} onClick={() => { setMessage(""); setError(""); queue.resume(task.id); }}>Resume upload</button><button type="button" className={button} onClick={() => queue.forget(task.id)}>Remove from queue</button><span className="text-xs text-white/45">Saved parts are kept.</span></div>)}
      {visibleMessage ? <p role="status" className="break-words rounded-xl border border-white/10 p-3 text-sm text-white/80">{visibleMessage}</p> : null}
      {visibleError ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{visibleError}</p> : null}
      {removeTarget ? <div role="alertdialog" aria-label="Confirm source file removal" className="space-y-3 rounded-2xl border border-red-400/30 p-5">
        <p className="break-words text-white">Delete <strong>{removeTarget.filename}</strong> from the shared SIXFL TV branding library? Keep your own backup first.</p>
        <button type="button" className={button} disabled={mutationBusy} onClick={() => void remove(removeTarget)}>Confirm delete source</button>{" "}<button type="button" className={button} onClick={() => setRemoveTarget(null)}>Keep file</button>
      </div> : null}
      {preview ? <section className="rounded-2xl border border-white/10 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="break-words font-semibold text-white">Source preview: {preview.filename}</h2><button type="button" className={button} onClick={() => setPreview(null)}>Close preview</button></div><video key={preview.id} controls preload="metadata" playsInline src={mediaUrl(preview)} className="aspect-video w-full rounded-xl bg-black" /></section> : null}
      <section className="space-y-3"><h3 className="text-lg font-semibold text-white">Saved shared branding</h3>{rows(state.assets.filter(a => a.shared))}{!state.assets.some(a => a.shared) ? <p className="text-sm text-white/50">No shared intro or outro uploaded yet.</p> : null}</section>
      <div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/60">
        <strong className="text-white/85">Private SIXFL cloud storage</strong><br />Uploaded parts: {sizeLabel(state.uploadedBytes)} · Reserved including incomplete files: {sizeLabel(state.reservedBytes)} / {sizeLabel(state.limitBytes)}.
      </div>
    </div>;
  }

  return <div className="space-y-6 pb-20">
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm leading-6 text-emerald-100">
      <strong>Background footage uploads.</strong> The current transfer keeps running while you move around SIXFL admin. You can open another match, choose its files and add them to the same queue; they will upload in order. Keep this browser tab open and your computer awake because refreshing or closing it interrupts transfer. When the whole match upload batch finishes and a confirmed result already exists, private SIXFL TV previews are queued automatically. Nothing is published to YouTube, emailed to players or used to replace existing links without the separate approval step.
      <div className="mt-3"><Link href="/admin/sixfl-tv/fixtures" className={button}>Upload another match</Link></div>
    </div>
    {!state.configured ? <p role="alert" className="text-red-200">Private storage is not configured. Uploads are disabled; your existing video links still work.</p> : null}
    <div className="grid gap-4 lg:grid-cols-2">
      {picker("CLIP", "Choose several goals, saves or other clips. You can change their order below.")}
      {picker("FULL_MATCH", "Choose the complete match recording. This is separate from the clips.")}
    </div>
    <details className="rounded-2xl border border-white/10 p-4"><summary className="cursor-pointer font-semibold text-white/80">Already have an edited highlights video?</summary><div className="mt-4">{picker("HIGHLIGHTS", "Upload one assembled highlights file instead of individual clips, or keep it alongside them.")}</div></details>
    {selection.length ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5">
      <p className="font-semibold text-white">Selected: {selection.length} file{selection.length === 1 ? "" : "s"} · {sizeLabel(selection.reduce((sum, s) => sum + s.file.size, 0))}</p>
      <p className="mt-2 break-words text-sm text-white/60">{selection.map(s => s.file.name).join(" · ")}</p>
      <div className="mt-4 flex gap-3"><button type="button" className={button} disabled={busy || !state.configured} onClick={upload}>Upload selected files</button><button type="button" className={button} disabled={busy} onClick={() => setSelection([])}>Clear selection</button></div>
    </div> : null}
    {active ? <div className="space-y-2"><progress aria-label="Current file upload progress" value={progress} max={100} className="h-3 w-full accent-emerald-400" /><button type="button" className={button} onClick={() => queue.pause(active.id)}>Pause after current part</button></div> : null}
    {tasks.filter(task => task.status === "PAUSED" || task.status === "FAILED").map(task => <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-3"><span className="break-words text-sm text-white/70">{task.filename}</span><button type="button" className={button} onClick={() => { setMessage(""); setError(""); queue.resume(task.id); }}>Resume upload</button><button type="button" className={button} onClick={() => queue.forget(task.id)}>Remove from queue</button><span className="text-xs text-white/45">Saved parts are kept.</span></div>)}
    {visibleMessage ? <p role="status" className="break-words rounded-xl border border-white/10 p-3 text-sm text-white/80">{visibleMessage}</p> : null}
    {visibleError ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{visibleError}</p> : null}
    {removeTarget ? <div role="alertdialog" aria-label="Confirm source file removal" className="space-y-3 rounded-2xl border border-red-400/30 p-5">
      <p className="break-words text-white">Delete <strong>{removeTarget.filename}</strong> from private SIXFL storage?{removeTarget.shared ? " This intro/outro is shared across all match upload pages." : ""} Keep your own backup first.</p>
      <button type="button" className={button} disabled={mutationBusy} onClick={() => void remove(removeTarget)}>Confirm delete source</button>{" "}<button type="button" className={button} onClick={() => setRemoveTarget(null)}>Keep file</button>
    </div> : null}
    {preview ? <section className="rounded-2xl border border-white/10 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="break-words font-semibold text-white">Source preview: {preview.filename}</h2><button type="button" className={button} onClick={() => setPreview(null)}>Close preview</button></div><video key={preview.id} controls preload="metadata" playsInline src={mediaUrl(preview)} className="aspect-video w-full rounded-xl bg-black" /><p className="mt-2 text-sm text-white/50">Original footage only. If this MP4 codec is not supported by your browser, download the source to check it.</p></section> : null}
    <section className="space-y-3"><h2 className="text-xl font-semibold text-white">Clips — saved editing order</h2>{rows(state.assets.filter(a => a.kind === "CLIP"))}{!state.assets.some(a => a.kind === "CLIP") ? <p className="text-sm text-white/50">No clips uploaded for this match yet.</p> : null}</section>
    <section className="space-y-3"><h2 className="text-xl font-semibold text-white">Full match and ready-made highlights</h2>{rows(state.assets.filter(a => a.kind === "FULL_MATCH" || a.kind === "HIGHLIGHTS"))}</section>
    <div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/60">
      <strong className="text-white/85">Private SIXFL cloud storage</strong><br />Uploaded parts: {sizeLabel(state.uploadedBytes)} · Reserved including incomplete files: {sizeLabel(state.reservedBytes)} / {sizeLabel(state.limitBytes)}.<br />This limit covers the new footage library, not your entire Railway account. Storage and transfers are billed by Railway. Nothing is deleted automatically. Uploads continue across admin pages in this tab. After a reload or interruption, reselect the same file to resume saved parts.
    </div>
  </div>;
}
