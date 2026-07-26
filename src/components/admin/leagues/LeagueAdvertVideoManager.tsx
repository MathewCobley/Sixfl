"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type VideoState = {
  hasVideo: boolean;
  filename: string | null;
  sizeBytes: number | null;
  enabled: boolean;
  uploadedAt: string | null;
};

export default function LeagueAdvertVideoManager({
  leagueId,
  leagueName,
  initialVideo,
}: {
  leagueId: string;
  leagueName: string;
  initialVideo: VideoState;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState(initialVideo);
  const [busy, setBusy] = useState<"upload" | "toggle" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(Date.now());

  function formatBytes(value: number | null) {
    if (!value) return null;
    const megabytes = value / (1024 * 1024);
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
  }

  async function uploadVideo() {
    const file = inputRef.current?.files?.[0];
    if (!file || busy) return;

    setBusy("upload");
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("video", file);

      const response = await fetch(`/api/admin/leagues/${leagueId}/advert-video`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | (VideoState & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The video could not be uploaded.");
      }

      setVideo({
        hasVideo: Boolean(payload?.hasVideo),
        filename: payload?.filename ?? file.name,
        sizeBytes: payload?.sizeBytes ?? file.size,
        enabled: payload?.enabled ?? true,
        uploadedAt: payload?.uploadedAt ?? new Date().toISOString(),
      });
      setVersion(Date.now());
      setMessage("League advert uploaded and shown on the public league page.");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The video could not be uploaded.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function setEnabled(enabled: boolean) {
    if (busy || !video.hasVideo) return;

    setBusy("toggle");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/leagues/${leagueId}/advert-video`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (VideoState & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The visibility could not be changed.");
      }

      setVideo((current) => ({ ...current, enabled }));
      setMessage(enabled ? "Video is now public." : "Video is now hidden from the public page.");
      router.refresh();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "The visibility could not be changed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeVideo() {
    if (busy || !video.hasVideo) return;
    if (!window.confirm("Remove this league advert video from SIXFL storage?")) return;

    setBusy("delete");
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/leagues/${leagueId}/advert-video`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "The video could not be removed.");
      }

      setVideo({
        hasVideo: false,
        filename: null,
        sizeBytes: null,
        enabled: false,
        uploadedAt: null,
      });
      setMessage("League advert removed.");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The video could not be removed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.25)] md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">
              League media
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white">
              Advert video for {leagueName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
              Upload one MP4 advert of up to 50 MB. It is stored privately in the
              Railway media bucket and streamed through SIXFL.
            </p>
          </div>

          {video.hasVideo ? (
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                video.enabled
                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                  : "border-amber-400/25 bg-amber-500/10 text-amber-100"
              }`}
            >
              {video.enabled ? "Public" : "Hidden"}
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
          <div className="space-y-4">
            <label className="block rounded-2xl border border-dashed border-white/15 bg-black/20 p-5">
              <span className="block text-sm font-semibold text-white">
                Choose an MP4 video
              </span>
              <span className="mt-1 block text-xs leading-5 text-white/45">
                A short 1080p H.264 MP4 will load best on phones and desktops.
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,.mp4"
                disabled={Boolean(busy)}
                className="mt-4 block w-full text-sm text-white/65 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
              />
            </label>

            <button
              type="button"
              onClick={uploadVideo}
              disabled={Boolean(busy)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-55"
            >
              {busy === "upload"
                ? "Uploading… do not close this page"
                : video.hasVideo
                  ? "Replace advert video"
                  : "Upload advert video"}
            </button>

            {video.hasVideo ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                <div className="font-semibold text-white">{video.filename || "League advert.mp4"}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/45">
                  {formatBytes(video.sizeBytes) ? <span>{formatBytes(video.sizeBytes)}</span> : null}
                  {video.uploadedAt ? (
                    <span>
                      Uploaded {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(video.uploadedAt))}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}
          </div>

          <div>
            {video.hasVideo ? (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <video
                  key={version}
                  src={`/api/admin/leagues/${leagueId}/advert-video/stream?v=${version}`}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[620px] w-full bg-black object-contain"
                />
              </div>
            ) : (
              <div className="flex min-h-64 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/40">
                The video preview will appear here after upload.
              </div>
            )}
          </div>
        </div>
      </section>

      {video.hasVideo ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-8">
          <h2 className="text-lg font-semibold text-white">Public display</h2>
          <p className="mt-1 text-sm leading-6 text-white/55">
            Hide the advert without deleting it, or remove it permanently from the
            media bucket.
          </p>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/80">
              <input
                type="checkbox"
                checked={video.enabled}
                disabled={Boolean(busy)}
                onChange={(event) => void setEnabled(event.target.checked)}
                className="h-5 w-5 accent-emerald-400"
              />
              Show advert on the public league page
            </label>

            <button
              type="button"
              onClick={removeVideo}
              disabled={Boolean(busy)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 text-sm font-semibold text-red-100 transition hover:bg-red-500/15 disabled:cursor-wait disabled:opacity-50"
            >
              {busy === "delete" ? "Removing…" : "Remove video"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
