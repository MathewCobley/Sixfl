"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { FootageUploadQueue, uploadPending } from "./footage-upload-queue";

const UploadContext = createContext<FootageUploadQueue | null>(null);
export function useFootageUploads() {
  const queue = useContext(UploadContext);
  if (!queue) throw new Error("The footage uploader must be inside the admin upload provider.");
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getServerSnapshot);
  return { queue, snapshot };
}
const button = "min-h-10 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10";

function UploadProgress() {
  const { queue, snapshot } = useFootageUploads();
  const [expanded, setExpanded] = useState(false);
  const tasks = snapshot.tasks, active = tasks.find(task => task.status === "UPLOADING");
  const pending = tasks.filter(uploadPending).length;
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  if (!tasks.length) return null;
  const percent = active ? Math.min(100, Math.round(active.uploadedBytes / active.sizeBytes * 100)) : null;
  return <aside aria-label="Background footage uploads" className="fixed bottom-3 right-3 z-40 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-emerald-400/35 bg-slate-950 p-3 text-white shadow-2xl">
    <div className="flex items-center justify-between gap-2">
      <button type="button" aria-expanded={expanded} aria-controls="sixfl-upload-queue" onClick={() => setExpanded(value => !value)} className="min-w-0 flex-1 text-left text-sm font-semibold">
        Uploads · {active ? `${percent}% · ${pending} remaining` : pending ? `${pending} paused / waiting` : `${tasks.length} complete`} {expanded ? "▾" : "▸"}
      </button>
      {!pending ? <button type="button" className={button} onClick={() => tasks.forEach(task => queue.forget(task.id))}>Dismiss</button> : null}
    </div>
    {active ? <><p className="mt-1 truncate text-xs text-white/70">{active.fixtureLabel} · {active.filename}</p><progress aria-label="Background upload progress" max={100} value={percent ?? 0} className="mt-2 h-2 w-full accent-emerald-400" /></> : null}
    {expanded ? <div id="sixfl-upload-queue" className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto" aria-live="polite">
      <p className="text-xs leading-5 text-white/65">You can switch between SIXFL admin pages. Keep this browser tab open and your computer awake. Refreshing, signing out or closing the tab interrupts transfer; saved parts can be resumed.</p>
      {tasks.map(task => <div key={task.id} className="rounded-xl border border-white/10 p-3">
        <Link href={`/admin/sixfl-tv/footage/${encodeURIComponent(task.fixtureId)}`} className="text-xs font-semibold text-emerald-300 underline underline-offset-4">{task.fixtureLabel}</Link>
        <p className="mt-1 break-words text-sm">{task.filename}</p>
        <p className="mt-1 text-xs text-white/65">{task.status === "COMPLETE" ? "Uploaded — private source" : task.status === "UPLOADING" ? `${Math.round(task.uploadedBytes / task.sizeBytes * 100)}% uploaded` : task.status.toLowerCase()}</p>
        {task.error ? <p className="mt-2 break-words text-xs text-red-200">{task.error}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {task.status === "UPLOADING" || task.status === "QUEUED" ? <button type="button" className={button} onClick={() => queue.pause(task.id)}>Pause upload</button> : null}
          {task.status === "PAUSED" || task.status === "FAILED" ? <button type="button" className={button} onClick={() => queue.resume(task.id)}>Resume upload</button> : null}
          {task.status !== "UPLOADING" ? <button type="button" className={button} onClick={() => queue.forget(task.id)}>{task.status === "COMPLETE" ? "Dismiss" : "Remove from queue"}</button> : null}
        </div>
        {task.status === "PAUSED" || task.status === "FAILED" ? <p className="mt-2 text-xs text-white/45">Removing from this queue keeps all uploaded parts in storage.</p> : null}
      </div>)}
    </div> : null}
  </aside>;
}

export default function FootageUploadProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new FootageUploadQueue());
  // Internal admin navigation preserves this provider; leaving admin stops local transfers.
  useEffect(() => () => queue.stop(), [queue]);
  return <UploadContext.Provider value={queue}>{children}<UploadProgress /></UploadContext.Provider>;
}
