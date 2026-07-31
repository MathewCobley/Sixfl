// ========================================
// File: src/components/admin/kits/KitDesignUploader.tsx
// ========================================

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function KitDesignUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  async function uploadFiles() {
    if (files.length === 0 || uploading) return;

    setUploading(true);
    setProgress(0);
    setMessage(null);
    setErrors([]);

    const failed: string[] = [];
    let uploaded = 0;

    for (const file of files) {
      try {
        const body = new FormData();
        body.append("file", file);

        const response = await fetch("/api/admin/kits/upload", {
          method: "POST",
          body,
        });
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!response.ok || !payload?.ok) {
          failed.push(`${file.name}: ${payload?.error ?? "Upload failed"}`);
        } else {
          uploaded += 1;
        }
      } catch {
        failed.push(`${file.name}: Upload failed`);
      }

      setProgress((current) => current + 1);
    }

    setUploading(false);
    setErrors(failed);
    setMessage(
      `${uploaded} kit image${uploaded === 1 ? "" : "s"} uploaded${
        failed.length ? `; ${failed.length} failed` : " successfully"
      }.` ,
    );

    if (uploaded > 0) {
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  return (
    <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-white">Upload kit catalogue</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Select multiple PNG, JPEG or WebP images. Each file is uploaded separately,
            resized for the website and stored safely in the SIXFL database. The filename
            becomes the kit code, so a file named <span className="font-mono text-emerald-200">z755.png</span>
            becomes kit <span className="font-semibold text-white">Z755</span>.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:min-w-[320px]">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []))
            }
            className="block w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/15"
          />

          <button
            type="button"
            disabled={uploading || files.length === 0}
            onClick={uploadFiles}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading
              ? `Uploading ${progress} of ${files.length}…`
              : `Upload ${files.length || "selected"} image${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
          {message}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          <div className="font-semibold">Images that need attention</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-red-100/80">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
