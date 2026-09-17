// Browser-owned transfers; file references are never serialised or copied to localStorage.
// The admin layout owns one queue, independently of the currently displayed match page.
import { FOOTAGE_PART_BYTES, footageId, footageSpec, type FootageKind } from "@/lib/sixfl-tv/footage-policy";

export type UploadAsset = { id: string; filename: string; sizeBytes: number; partCount: number };
export type UploadSelection = { file: File; kind: FootageKind; asset?: UploadAsset };
export type UploadTask = {
  id: string; fixtureId: string; fixtureLabel: string; filename: string; kind: FootageKind;
  sizeBytes: number; uploadedBytes: number; status: "QUEUED" | "UPLOADING" | "PAUSED" | "FAILED" | "COMPLETE";
  message: string; error: string; assetId?: string;
};
export type UploadSnapshot = { tasks: readonly UploadTask[]; revision: number };
type Entry = { view: UploadTask; file: File | null; asset?: UploadAsset; pause: boolean };
export type UploadTransport = {
  json<T>(url: string, signal: AbortSignal, body?: Record<string, unknown>): Promise<T>;
  put(url: string, bytes: ArrayBuffer, signal: AbortSignal, progress: (loaded: number) => void): Promise<void>;
  digest(bytes: ArrayBuffer): Promise<string>;
};
const initialSnapshot: UploadSnapshot = { tasks: [], revision: 0 };
export const uploadPending = (task: UploadTask) => task.status !== "COMPLETE";

export const browserUploadTransport: UploadTransport = {
  async json<T>(url: string, signal: AbortSignal, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(url, { ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session may have expired. Sign in again, then resume the upload.");
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "The footage request failed.");
    return value as T;
  },
  put(url, bytes, signal, progress) {
    signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => xhr.abort();
      const finish = (error?: Error) => { signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(); };
      xhr.open("PUT", url); xhr.timeout = 180000;
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.upload.onprogress = event => progress(Math.min(bytes.byteLength, event.loaded));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.getResponseHeader("content-type")?.includes("application/json")) { finish(); return; }
        let message = "Upload interrupted. Sign in if needed, then resume. Completed parts are saved.";
        try { message = JSON.parse(xhr.responseText).error || message; } catch { /* Login HTML is not upload success. */ }
        finish(new Error(message));
      };
      xhr.onerror = () => finish(new Error("Connection lost. Completed parts are saved; resume this upload."));
      xhr.ontimeout = () => finish(new Error("Upload timed out. Completed parts are saved; resume this upload."));
      xhr.onabort = () => finish(new Error("Upload paused. Completed parts are saved."));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { finish(new Error("Upload paused.")); return; }
      xhr.send(bytes);
    });
  },
  async digest(bytes) {
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
  },
};

export class FootageUploadQueue {
  private entries: Entry[] = [];
  private listeners = new Set<() => void>();
  private snapshot: UploadSnapshot = initialSnapshot;
  private running = false;
  private controller: AbortController | null = null;
  private serial = 0;
  constructor(private transport: UploadTransport = browserUploadTransport) {}
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initialSnapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(changedOnServer = false) {
    this.snapshot = { tasks: this.entries.map(entry => ({ ...entry.view })), revision: this.snapshot.revision + (changedOnServer ? 1 : 0) };
    this.listeners.forEach(listener => listener());
  }
  enqueue(fixtureId: string, fixtureLabel: string, selections: UploadSelection[]) {
    footageId(fixtureId);
    // Validate the whole batch before changing the queue.
    for (const { file, kind, asset } of selections) {
      footageSpec({ kind, filename: file.name, sizeBytes: file.size, lastModified: file.lastModified });
      if (asset && (asset.filename !== file.name || asset.sizeBytes !== file.size)) throw new Error("Choose the same filename and size as the incomplete upload.");
    }
    if (selections.length + this.entries.filter(entry => entry.file).length > 100) throw new Error("Finish or remove queued selections before adding more than 100 files.");
    let added = 0;
    for (const { file, kind, asset } of selections) {
      const shared = kind === "INTRO" || kind === "OUTRO";
      const duplicate = this.entries.some(entry => entry.file && (shared || entry.view.fixtureId === fixtureId) && entry.view.kind === kind &&
        (asset ? entry.asset?.id === asset.id : entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified));
      if (duplicate) continue;
      this.entries.push({ file, asset, pause: false, view: { id: `upload-${++this.serial}`, fixtureId, fixtureLabel, filename: file.name, kind, sizeBytes: file.size, uploadedBytes: 0, status: "QUEUED", message: "Waiting in upload queue.", error: "", assetId: asset?.id } });
      added++;
    }
    this.emit(); void this.pump();
    return added;
  }
  pause(id: string) {
    const entry = this.entries.find(item => item.view.id === id);
    if (!entry || !["UPLOADING", "QUEUED"].includes(entry.view.status)) return;
    entry.pause = true;
    if (entry.view.status === "QUEUED") entry.view.status = "PAUSED";
    entry.view.message = entry.view.status === "UPLOADING" ? "Pausing after the current part is safely saved…" : "Paused. Resume without selecting the file again.";
    this.emit();
  }
  resume(id: string) {
    const entry = this.entries.find(item => item.view.id === id);
    if (!entry?.file || !["PAUSED", "FAILED"].includes(entry.view.status)) return;
    entry.pause = false; entry.view.status = "QUEUED"; entry.view.error = ""; entry.view.message = "Waiting to resume saved parts.";
    this.emit(); void this.pump();
  }
  forget(id: string) {
    // This drops the local selection only. It NEVER deletes uploaded source bytes.
    this.entries = this.entries.filter(entry => entry.view.id !== id || entry.view.status === "UPLOADING");
    this.emit();
  }
  stop() {
    // Called only when the persistent admin layout is left (including sign-out).
    for (const entry of this.entries) this.pause(entry.view.id);
    this.controller?.abort();
  }
  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const entry = this.entries.find(item => item.view.status === "QUEUED");
        if (!entry) break;
        const controller = new AbortController(); this.controller = controller;
        entry.view.status = "UPLOADING"; this.emit();
        try {
          await this.transfer(entry, controller.signal);
          if (entry.pause) {
            entry.view.status = "PAUSED"; entry.view.message = "Paused. Resume without selecting the file again.";
          } else {
            entry.view.status = "COMPLETE"; entry.view.uploadedBytes = entry.view.sizeBytes;
            entry.view.message = "Footage saved privately against this match. Nothing has been published or emailed.";
            entry.file = null;
          }
        } catch (error) {
          entry.view.status = entry.pause || controller.signal.aborted ? "PAUSED" : "FAILED";
          entry.view.error = entry.view.status === "FAILED" ? (error instanceof Error ? error.message : "Upload failed.") : "";
          entry.view.message = "Completed parts are saved. Resume here, or reselect the same file after a page reload.";
          // A failed session/connection should not start a cascade of failed uploads.
          for (const waiting of this.entries) if (waiting.view.status === "QUEUED") { waiting.pause = true; waiting.view.status = "PAUSED"; waiting.view.message = "Paused after another upload was interrupted."; }
        } finally { this.controller = null; this.emit(true); }
      }
    } finally { this.running = false; }
  }
  private async transfer(entry: Entry, signal: AbortSignal) {
    const file = entry.file;
    if (!file) throw new Error("Select the source file again.");
    const endpoint = `/api/admin/sixfl-tv/footage/${encodeURIComponent(entry.view.fixtureId)}`;
    const asset = entry.asset || (await this.transport.json<{ asset: UploadAsset }>(endpoint, signal, { action: "begin", kind: entry.view.kind, filename: file.name, sizeBytes: file.size, lastModified: file.lastModified })).asset;
    if (!asset || asset.sizeBytes !== file.size || asset.partCount !== Math.ceil(file.size / FOOTAGE_PART_BYTES)) throw new Error("Saved upload does not match the selected file.");
    entry.asset = asset; entry.view.assetId = asset.id; this.emit(true);
    const resume = await this.transport.json<{ parts: Array<{ partNumber: number; sha256: string }> }>(`${endpoint}?assetId=${encodeURIComponent(asset.id)}`, signal);
    const saved = new Map(resume.parts.map(part => [part.partNumber, part.sha256]));
    entry.view.uploadedBytes = 0;
    for (let part = 0; part < asset.partCount; part++) {
      signal.throwIfAborted(); if (entry.pause) return;
      const base = part * FOOTAGE_PART_BYTES;
      entry.view.message = `${file.name} — ${saved.has(part) ? "checking saved part" : "uploading part"} ${part + 1}/${asset.partCount}`; this.emit();
      const bytes = await file.slice(base, Math.min(base + FOOTAGE_PART_BYTES, file.size)).arrayBuffer();
      signal.throwIfAborted(); if (entry.pause) return;
      if (saved.has(part)) {
        if (await this.transport.digest(bytes) !== saved.get(part)) throw new Error("This file differs from the saved upload. Remove the incomplete upload before using a different version.");
      } else {
        await this.transport.put(`${endpoint}?assetId=${encodeURIComponent(asset.id)}&part=${part}`, bytes, signal, loaded => {
          entry.view.uploadedBytes = Math.min(file.size, base + loaded); this.emit();
        });
      }
      entry.view.uploadedBytes = Math.min(base + bytes.byteLength, file.size); this.emit();
    }
    signal.throwIfAborted(); if (entry.pause) return;
    entry.view.message = "Finalising saved footage…"; this.emit();
    await this.transport.json(endpoint, signal, { action: "finish", assetId: asset.id });
    // If pause was clicked during finish, the server has nevertheless completed it.
    entry.pause = false;
  }
}
