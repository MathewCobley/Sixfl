"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type CallStatus = { id: string; calledAt: string | null };
type StatusResponse = { leads?: CallStatus[] };

type CallUpdateResponse = {
  ok?: boolean;
  calledAt?: string;
  error?: string;
};

type NoteUpdateResponse = {
  ok?: boolean;
  error?: string;
};

let sharedStatusRequest: Promise<Map<string, string | null>> | null = null;

function loadCallStatuses(force = false) {
  if (force) sharedStatusRequest = null;

  if (!sharedStatusRequest) {
    sharedStatusRequest = fetch("/api/admin/leads/call-status", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load lead call status.");
        const payload = (await response.json()) as StatusResponse;
        return new Map((payload.leads ?? []).map((lead) => [lead.id, lead.calledAt]));
      })
      .catch((error) => {
        sharedStatusRequest = null;
        throw error;
      });
  }

  return sharedStatusRequest;
}

function formatCalledAt(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export default function LeadCallNotesCell({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [calledAt, setCalledAt] = useState<string | null | undefined>(undefined);
  const [markingCalled, setMarkingCalled] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void loadCallStatuses()
      .then((statuses) => {
        if (active) setCalledAt(statuses.get(leadId) ?? null);
      })
      .catch(() => {
        if (active) setCalledAt(null);
      });

    return () => {
      active = false;
    };
  }, [leadId]);

  async function markCalled() {
    if (markingCalled) return;
    setMarkingCalled(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/leads/call-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ leadId }),
      });
      const payload = (await response.json().catch(() => ({}))) as CallUpdateResponse;
      if (!response.ok || !payload.calledAt) {
        throw new Error(payload.error || "Could not mark lead as called.");
      }

      setCalledAt(payload.calledAt);
      void loadCallStatuses(true);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not mark lead as called.");
    } finally {
      setMarkingCalled(false);
    }
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = note.trim();
    if (!trimmed || savingNote) return;

    setSavingNote(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/leads/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ leadId, note: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as NoteUpdateResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not save lead note.");
      }

      setNote("");
      setNoteOpen(false);
      setFeedback("Note saved");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save lead note.");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="min-w-[185px]">
      {calledAt ? (
        <>
          <div className="inline-flex rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">
            ✓ Called
          </div>
          <div className="mt-1 whitespace-nowrap text-[11px] text-white/40">
            {formatCalledAt(calledAt)}
          </div>
        </>
      ) : calledAt === undefined ? (
        <div className="text-xs text-white/35">Loading…</div>
      ) : (
        <button
          type="button"
          onClick={markCalled}
          disabled={markingCalled}
          className="inline-flex min-h-9 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-60"
        >
          {markingCalled ? "Saving…" : "Mark called"}
        </button>
      )}

      <div className="mt-2">
        {!noteOpen ? (
          <button
            type="button"
            onClick={() => {
              setNoteOpen(true);
              setFeedback(null);
            }}
            className="text-xs font-semibold text-emerald-200 hover:text-emerald-100"
          >
            + Add note
          </button>
        ) : (
          <form onSubmit={saveNote} className="w-[220px] space-y-2">
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What did they say?"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/30 focus:border-emerald-500/50"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!note.trim() || savingNote}
                className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-100 disabled:opacity-60"
              >
                {savingNote ? "Saving…" : "Save note"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNote("");
                  setNoteOpen(false);
                  setFeedback(null);
                }}
                className="px-2 py-1.5 text-xs text-white/50 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {feedback ? (
        <div className="mt-2 max-w-[220px] text-[11px] leading-4 text-white/45">
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
