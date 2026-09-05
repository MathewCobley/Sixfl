"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_TYPES, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/images/constants";

export default function TeamBadgeUploader({ teamId, teamName, initialLogoUrl }: {
  teamId: string;
  teamName: string;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [savedLogoUrl, setSavedLogoUrl] = useState(initialLogoUrl);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function clearSelection() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPreviewUrl(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setError("");
    setMessage("");
    setConfirmRemove(false);
    if (!(IMAGE_UPLOAD_TYPES as readonly string[]).includes(nextFile.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (nextFile.size <= 0 || nextFile.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError("Choose an image no larger than 5 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const url = URL.createObjectURL(nextFile);
    objectUrlRef.current = url;
    setPreviewUrl(url);
    setFile(nextFile);
  }

  async function save(action: "save" | "remove") {
    if (busy || (action === "save" && !file)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("action", action);
      form.set("expectedLogoUrl", savedLogoUrl ?? "");
      if (action === "save" && file) form.set("file", file);
      const response = await fetch(`/api/admin/teams/${encodeURIComponent(teamId)}/badge`, {
        method: "POST", headers: { "X-SIXFL-Upload": "1" }, body: form,
      });
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) {
        throw new Error("Your session may have expired. Sign in again, then retry the upload.");
      }
      const result = await response.json() as { ok?: boolean; logoUrl?: string | null; error?: string };
      if (!response.ok || !result.ok || !(typeof result.logoUrl === "string" || result.logoUrl === null)) {
        throw new Error(result.error || "The badge could not be saved.");
      }
      setSavedLogoUrl(result.logoUrl);
      clearSelection();
      setConfirmRemove(false);
      setMessage(action === "remove" ? "Badge removed from this team." : "Badge saved. It is now used throughout the website.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The badge could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const shownUrl = previewUrl || savedLogoUrl;
  return (
    <div className="mt-6 space-y-5" aria-busy={busy}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-black/30 p-4">
          {shownUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={shownUrl} src={shownUrl} alt={`${teamName} badge${file ? " preview" : ""}`} className="h-full w-full object-contain" />
          ) : <span className="text-sm text-white/50">No badge set</span>}
        </div>
        <div className="min-w-0 space-y-3">
          <label htmlFor="team-badge-file" className="block text-sm font-semibold text-white">
            {savedLogoUrl ? "Replace badge" : "Upload badge"}
          </label>
          <input ref={inputRef} id="team-badge-file" type="file" accept={IMAGE_UPLOAD_ACCEPT}
            disabled={busy} onChange={(event) => chooseFile(event.currentTarget.files?.[0])}
            aria-describedby="team-badge-help" className="block w-full text-sm text-white/75 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-400 file:px-4 file:py-2.5 file:font-semibold file:text-black disabled:opacity-50" />
          <p id="team-badge-help" className="text-xs leading-5 text-white/55">
            PNG, JPEG or WebP, up to 5 MB. The whole badge is kept, including any transparent background.
          </p>
          {file ? <p className="break-words text-sm text-emerald-200">Preview: {file.name}. Not saved yet.</p> : null}
        </div>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save("save")} disabled={busy || !file}
          className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Saving…" : "Save badge"}
        </button>
        {file ? <button type="button" onClick={clearSelection} disabled={busy} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/80 disabled:opacity-40">Cancel selection</button> : null}
        {savedLogoUrl && !confirmRemove ? <button type="button" onClick={() => { setConfirmRemove(true); setError(""); setMessage(""); }} disabled={busy}
          className="rounded-xl border border-red-400/25 px-4 py-2.5 text-sm text-red-200 disabled:opacity-40">Remove badge</button> : null}
      </div>
      {confirmRemove ? (
        <div className="space-y-3 rounded-xl border border-red-400/25 bg-red-400/5 p-4">
          <p className="text-sm text-white/80">Remove the current badge from {teamName}? The team will use its default badge instead.</p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => void save("remove")} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Yes, remove badge</button>
            <button type="button" disabled={busy} onClick={() => setConfirmRemove(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 disabled:opacity-40">Keep badge</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
