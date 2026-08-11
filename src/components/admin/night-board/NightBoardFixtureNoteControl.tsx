"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function NightBoardFixtureNoteControl({
  fixtureId,
}: {
  fixtureId: string;
}) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetch(
      `/api/admin/night-board/fixture-note?fixtureId=${encodeURIComponent(fixtureId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { note?: string | null; error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load the fixture note.");
        }
        setNote(payload?.note ?? "");
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the fixture note.",
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [fixtureId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/night-board/fixture-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, note }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { note?: string | null; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the fixture note.");
      }
      setNote(payload?.note ?? "");
      setMessage(payload?.note ? "Saved — this will print on the A5 tally sheet." : "Note cleared.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the fixture note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-500/[0.06] p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/70">
            Fixture note
          </span>
          <span className="ml-2 text-[10px] text-white/35">
            prints on A5 tally sheet
          </span>
          <textarea
            value={note}
            onChange={(event) => {
              setNote(event.target.value.slice(0, 240));
              setMessage("");
            }}
            maxLength={240}
            rows={2}
            disabled={loading || saving}
            placeholder={loading ? "Loading note…" : "e.g. Bring spare bibs / collect paperwork / new keeper"}
            className="mt-1.5 min-h-16 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-normal text-white outline-none placeholder:text-white/25 focus:border-amber-300/35 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={loading || saving}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
      </div>

      {message ? (
        <div className="mt-2 text-xs text-emerald-200">{message}</div>
      ) : null}
      {error ? <div className="mt-2 text-xs text-red-200">{error}</div> : null}
    </form>
  );
}
