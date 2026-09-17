"use client";

import { useEffect, useRef, useState } from "react";
import { FOOTAGE_PART_BYTES, FOOTAGE_LIMITS, footageSpec, type FootageKind } from "@/lib/sixfl-tv/footage-policy";
import type { footageState } from "@/lib/sixfl-tv/footage";
type State = Awaited<ReturnType<typeof footageState>>;
type Asset = State["assets"][number];
type Selection = { file: File; kind: FootageKind; asset?: Asset };
const labels: Record<FootageKind, string> = { CLIP: "Highlight clips", HIGHLIGHTS: "Ready-made highlights", FULL_MATCH: "Full match", INTRO: "SIXFL TV intro", OUTRO: "SIXFL TV outro" };
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
function sizeLabel(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
async function digest(bytes: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
async function json<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session may have expired. Sign in again, then resume the upload.");
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "The footage request failed.");
  return value as T;
}
function putPart(url: string, bytes: ArrayBuffer, progress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url); xhr.timeout = 180000;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = event => progress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.getResponseHeader("content-type")?.includes("application/json")) { resolve(); return; }
      let message = "Upload interrupted. Sign in if needed and reselect the same file to resume.";
      try { message = JSON.parse(xhr.responseText).error || message; } catch { /* Login HTML is not upload success. */ }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Connection lost. Completed parts are saved; reselect the same file to resume."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Completed parts are saved; reselect the same file to resume."));
    xhr.send(bytes);
  });
}
export default function FootageUploader({ fixtureId, initial, sharedOnly = false }: { fixtureId?: string; initial: State; sharedOnly?: boolean }) {
  const [state, setState] = useState(initial);
  const [selection, setSelection] = useState<Selection[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(""), [percent, setPercent] = useState(0);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Asset | null>(null);
  const running = useRef(false), pause = useRef(false);
  const endpoint = sharedOnly
    ? "/api/admin/sixfl-tv/footage/shared"
    : `/api/admin/sixfl-tv/footage/${encodeURIComponent(fixtureId || "")}`;
  const mediaUrl = (asset: Asset) => `${endpoint}/${encodeURIComponent(asset.id)}`;
  async function refresh() { setState(await json<State>(endpoint)); }
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  function choose(files: FileList | null, kind: FootageKind, asset?: Asset) {
    if (!files || running.current) return;
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
  async function upload() {
    if (running.current || !selection.length) return;
    running.current = true; pause.current = false; setBusy(true); setUploading(true); setError("");
    try {
      for (let fileIndex = 0; fileIndex < selection.length; fileIndex++) {
        if (pause.current) break;
        setPercent(0);
        const item = selection[fileIndex], file = item.file;
        const begun = item.asset ? { asset: item.asset } : await json<{ asset: Asset }>(endpoint, {
          action: "begin", kind: item.kind, filename: file.name, sizeBytes: file.size, lastModified: file.lastModified,
        });
        const asset = begun.asset;
        const resume = await json<{ parts: Array<{ partNumber: number; sha256: string }> }>(`${endpoint}?assetId=${encodeURIComponent(asset.id)}`);
        const saved = new Map(resume.parts.map(p => [p.partNumber, p.sha256]));
        await refresh();
        for (let part = 0; part < asset.partCount; part++) {
          if (pause.current) break;
          const base = part * FOOTAGE_PART_BYTES;
          setMessage(`${fileIndex + 1}/${selection.length}: ${file.name} — ${saved.has(part) ? "checking saved part" : "uploading part"} ${part + 1}/${asset.partCount}`);
          const bytes = await file.slice(base, Math.min(base + FOOTAGE_PART_BYTES, file.size)).arrayBuffer();
          if (saved.has(part)) {
            if (await digest(bytes) !== saved.get(part)) throw new Error("This file differs from the saved upload. Remove the incomplete upload before using a different version.");
          } else {
            await putPart(`${endpoint}?assetId=${encodeURIComponent(asset.id)}&part=${part}`, bytes, loaded => setPercent(Math.min(100, Math.round((base + loaded) / file.size * 100))));
          }
          setPercent(Math.round(Math.min(base + bytes.byteLength, file.size) / file.size * 100));
        }
        if (pause.current) break;
        await json(endpoint, { action: "finish", assetId: asset.id });
        await refresh();
      }
      setMessage(pause.current ? "Paused after the current part. Reselect the same file below to resume; completed parts are retained." : "Footage saved privately against this match. Nothing has been published or emailed.");
      if (!pause.current) setSelection([]);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { running.current = false; setBusy(false); setUploading(false); await refresh().catch(() => undefined); }
  }
  async function move(asset: Asset, direction: -1 | 1) {
    if (running.current) return;
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
    if (running.current) return;
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
    return <label className="block rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <span className="block text-lg font-semibold text-white">{labels[kind]}</span>
      <span className="mt-2 block text-sm leading-6 text-white/60">{help} MP4 only; up to {sizeLabel(FOOTAGE_LIMITS[kind])} per file.</span>
      <input aria-label={`Choose ${labels[kind].toLowerCase()}`} type="file" accept="video/mp4,.mp4" multiple={kind === "CLIP"} disabled={busy || !state.configured}
        className="mt-4 block w-full min-w-0 text-sm text-white/75 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-400 file:px-4 file:py-3 file:font-semibold file:text-black"
        onChange={event => { choose(event.currentTarget.files, kind); event.currentTarget.value = ""; }} />
    </label>;
  }
  function rows(assets: Asset[]) {
    return assets.map((asset, index) => <div key={asset.id} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="break-words font-semibold text-white">{asset.kind === "CLIP" ? `${index + 1}. ` : ""}{asset.filename}</p>
          <p className="mt-1 text-sm text-white/60">{labels[asset.kind]} · {sizeLabel(asset.sizeBytes)} · {asset.state === "READY" ? "Uploaded — private source" : asset.state === "DELETING" ? "Removal incomplete" : "Upload incomplete"}</p></div>
        <div className="flex flex-wrap gap-2">
          {asset.state === "READY" ? <><button type="button" className={button} onClick={() => setPreview(asset)}>Preview source</button><a className={button} href={`${mediaUrl(asset)}?download=1`}>Download source</a></> : null}
          {asset.kind === "CLIP" && asset.state !== "DELETING" ? <><button type="button" aria-label={`Move ${asset.filename} up`} disabled={busy || index === 0} onClick={() => void move(asset, -1)} className={button}>↑</button><button type="button" aria-label={`Move ${asset.filename} down`} disabled={busy || index === assets.length - 1} onClick={() => void move(asset, 1)} className={button}>↓</button></> : null}
          <button type="button" className={button} disabled={busy} onClick={() => setRemoveTarget(asset)}>{asset.state === "DELETING" ? "Continue removal" : "Remove"}</button>
        </div>
      </div>
      {asset.state === "UPLOADING" ? <label className="block text-sm text-white/70">Resume: choose the same MP4 file
        <input aria-label={`Resume ${asset.filename}`} type="file" accept="video/mp4,.mp4" disabled={busy} className="mt-2 block max-w-full"
          onChange={event => { choose(event.currentTarget.files, asset.kind, asset); event.currentTarget.value = ""; }} /></label> : null}
    </div>);
  }
  if (sharedOnly) {
    return <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {picker("INTRO", "Upload the reusable SIXFL TV intro once. It is available to every match.")}
        {picker("OUTRO", "Upload the reusable SIXFL TV outro once. It is available to every match.")}
      </div>
      {!state.configured ? <p role="alert" className="text-red-200">Private storage is not configured. Shared branding uploads are disabled.</p> : null}
      {selection.length ? <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5">
        <p className="font-semibold text-white">Selected: {selection.length} file{selection.length === 1 ? "" : "s"} · {sizeLabel(selection.reduce((sum, s) => sum + s.file.size, 0))}</p>
        <p className="mt-2 break-words text-sm text-white/60">{selection.map(s => s.file.name).join(" · ")}</p>
        <div className="mt-4 flex gap-3"><button type="button" className={button} disabled={busy || !state.configured} onClick={() => void upload()}>Upload selected files</button><button type="button" className={button} disabled={busy} onClick={() => setSelection([])}>Clear selection</button></div>
      </div> : null}
      {uploading ? <div className="space-y-2"><progress aria-label="Current file upload progress" value={percent} max={100} className="h-3 w-full accent-emerald-400" /><button type="button" className={button} onClick={() => { pause.current = true; setMessage("Pausing after the current part is safely saved…"); }}>Pause after current part</button></div> : null}
      {message ? <p role="status" className="break-words rounded-xl border border-white/10 p-3 text-sm text-white/80">{message}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
      {removeTarget ? <div role="alertdialog" aria-label="Confirm source file removal" className="space-y-3 rounded-2xl border border-red-400/30 p-5">
        <p className="break-words text-white">Delete <strong>{removeTarget.filename}</strong> from the shared SIXFL TV branding library? Keep your own backup first.</p>
        <button type="button" className={button} onClick={() => void remove(removeTarget)}>Confirm delete source</button>{" "}<button type="button" className={button} onClick={() => setRemoveTarget(null)}>Keep file</button>
      </div> : null}
      {preview ? <section className="rounded-2xl border border-white/10 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="break-words font-semibold text-white">Source preview: {preview.filename}</h2><button type="button" className={button} onClick={() => setPreview(null)}>Close preview</button></div><video key={preview.id} controls preload="metadata" playsInline src={mediaUrl(preview)} className="aspect-video w-full rounded-xl bg-black" /></section> : null}
      <section className="space-y-3"><h3 className="text-lg font-semibold text-white">Saved shared branding</h3>{rows(state.assets.filter(a => a.shared))}{!state.assets.some(a => a.shared) ? <p className="text-sm text-white/50">No shared intro or outro uploaded yet.</p> : null}</section>
      <div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/60">
        <strong className="text-white/85">Private SIXFL cloud storage</strong><br />Uploaded parts: {sizeLabel(state.uploadedBytes)} · Reserved including incomplete files: {sizeLabel(state.reservedBytes)} / {sizeLabel(state.limitBytes)}.
      </div>
    </div>;
  }

  return <div className="space-y-6">
    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100">
      <strong>Footage upload library.</strong> These are private source files for this fixture. Uploading does not publish anything or email players. After upload, generate and review a finished SIXFL TV preview before any separate YouTube approval.
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
      <div className="mt-4 flex gap-3"><button type="button" className={button} disabled={busy || !state.configured} onClick={() => void upload()}>Upload selected files</button><button type="button" className={button} disabled={busy} onClick={() => setSelection([])}>Clear selection</button></div>
    </div> : null}
    {uploading ? <div className="space-y-2"><progress aria-label="Current file upload progress" value={percent} max={100} className="h-3 w-full accent-emerald-400" /><button type="button" className={button} onClick={() => { pause.current = true; setMessage("Pausing after the current part is safely saved…"); }}>Pause after current part</button></div> : null}
    {message ? <p role="status" className="break-words rounded-xl border border-white/10 p-3 text-sm text-white/80">{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p> : null}
    {removeTarget ? <div role="alertdialog" aria-label="Confirm source file removal" className="space-y-3 rounded-2xl border border-red-400/30 p-5">
      <p className="break-words text-white">Delete <strong>{removeTarget.filename}</strong> from private SIXFL storage?{removeTarget.shared ? " This intro/outro is shared across all match upload pages." : ""} Keep your own backup first.</p>
      <button type="button" className={button} onClick={() => void remove(removeTarget)}>Confirm delete source</button>{" "}<button type="button" className={button} onClick={() => setRemoveTarget(null)}>Keep file</button>
    </div> : null}
    {preview ? <section className="rounded-2xl border border-white/10 p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="break-words font-semibold text-white">Source preview: {preview.filename}</h2><button type="button" className={button} onClick={() => setPreview(null)}>Close preview</button></div><video key={preview.id} controls preload="metadata" playsInline src={mediaUrl(preview)} className="aspect-video w-full rounded-xl bg-black" /><p className="mt-2 text-sm text-white/50">Original footage only. If this MP4 codec is not supported by your browser, download the source to check it.</p></section> : null}
    <section className="space-y-3"><h2 className="text-xl font-semibold text-white">Clips — saved editing order</h2>{rows(state.assets.filter(a => a.kind === "CLIP"))}{!state.assets.some(a => a.kind === "CLIP") ? <p className="text-sm text-white/50">No clips uploaded for this match yet.</p> : null}</section>
    <section className="space-y-3"><h2 className="text-xl font-semibold text-white">Full match and ready-made highlights</h2>{rows(state.assets.filter(a => a.kind === "FULL_MATCH" || a.kind === "HIGHLIGHTS"))}</section>
    <div className="rounded-2xl border border-white/10 p-4 text-sm leading-6 text-white/60">
      <strong className="text-white/85">Private SIXFL cloud storage</strong><br />Uploaded parts: {sizeLabel(state.uploadedBytes)} · Reserved including incomplete files: {sizeLabel(state.reservedBytes)} / {sizeLabel(state.limitBytes)}.<br />This limit covers the new footage library, not your entire Railway account. Storage and transfers are billed by Railway. Nothing is deleted automatically. Keep this page open while uploading; reselect the same file to resume after interruption.
    </div>
  </div>;
}
