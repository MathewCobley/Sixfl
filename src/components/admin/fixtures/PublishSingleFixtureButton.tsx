"use client";

import { useState } from "react";

export default function PublishSingleFixtureButton({
  fixtureId,
}: {
  fixtureId: string;
}) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  async function publishFixture() {
    if (publishing) return;

    const confirmed = window.confirm(
      "Publish this individual match? This will make it live, create/update team payment charges, and queue the related team emails and reminders.",
    );
    if (!confirmed) return;

    setPublishing(true);
    setError("");

    try {
      const response = await fetch("/api/admin/fixtures/publish-one", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            published?: boolean;
            alreadyPublished?: boolean;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "This fixture could not be published.");
      }

      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This fixture could not be published.",
      );
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={publishing}
        onClick={() => void publishFixture()}
        className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/40 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {publishing ? "Publishing…" : "Publish match"}
      </button>
      {error ? (
        <span className="max-w-64 text-right text-[11px] leading-4 text-red-200">
          {error}
        </span>
      ) : null}
    </div>
  );
}
