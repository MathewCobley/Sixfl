"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewStatus = "PENDING" | "CONFIRMED" | "CHANGE_REQUESTED";

type Props = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  initialStatus: ReviewStatus;
  initialConfirmedAt: string | null;
  initialChangeRequestedAt: string | null;
  initialChangeRequestNote: string | null;
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TeamBadgeReviewPanel({
  teamId,
  teamName,
  logoUrl,
  initialStatus,
  initialConfirmedAt,
  initialChangeRequestedAt,
  initialChangeRequestNote,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ReviewStatus>(initialStatus);
  const [confirmedAt, setConfirmedAt] = useState(initialConfirmedAt);
  const [changeRequestedAt, setChangeRequestedAt] = useState(
    initialChangeRequestedAt,
  );
  const [note, setNote] = useState(initialChangeRequestNote ?? "");
  const [showRequestForm, setShowRequestForm] = useState(
    initialStatus === "CHANGE_REQUESTED",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  async function submit(action: "confirm" | "request_change") {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/kit-badge-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, note }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            status?: ReviewStatus;
            confirmedAt?: string | null;
            changeRequestedAt?: string | null;
            changeRequestNote?: string | null;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.status) {
        throw new Error(payload?.error || "The badge choice could not be saved.");
      }

      setStatus(payload.status);
      setConfirmedAt(payload.confirmedAt ?? null);
      setChangeRequestedAt(payload.changeRequestedAt ?? null);
      setNote(payload.changeRequestNote ?? "");
      setShowRequestForm(payload.status === "CHANGE_REQUESTED");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The badge choice could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const hasBadge = Boolean(logoUrl && !imageFailed);

  return (
    <section className="overflow-visible rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_42%),rgba(255,255,255,0.035)] p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/75">
            Step 3
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Check your team badge
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            This is the badge SIXFL will use alongside {teamName} on fixtures,
            league tables and team graphics. Please confirm you are happy with it,
            or tell us what you would like changed.
          </p>

          {status === "CONFIRMED" ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Badge approved{confirmedAt ? ` on ${formatDate(confirmedAt)}` : ""}.
              You can still request a change below.
            </div>
          ) : status === "CHANGE_REQUESTED" ? (
            <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Change requested
              {changeRequestedAt ? ` on ${formatDate(changeRequestedAt)}` : ""}.
              SIXFL can now see your request.
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || !hasBadge}
              onClick={() => void submit("confirm")}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving…" : "Yes — keep this badge"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowRequestForm((current) => !current)}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-500/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:opacity-50"
            >
              {hasBadge ? "I’d like it changed" : "We need a team badge"}
            </button>
          </div>

          {showRequestForm ? (
            <div className="mt-4 max-w-2xl rounded-2xl border border-white/10 bg-black/20 p-4">
              <label className="block text-sm font-semibold text-white">
                What would you like changed?
              </label>
              <p className="mt-1 text-xs leading-5 text-white/45">
                Mention colours, wording, symbols or the style you would prefer.
              </p>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 600))}
                rows={4}
                placeholder="For example: keep the shield shape, but use blue and white and remove the football."
                className="mt-3 w-full rounded-2xl border border-white/10 bg-[#0d1428] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/25 focus:border-amber-400/45 focus:ring-2 focus:ring-amber-400/15"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-white/35">{note.length}/600</span>
                <button
                  type="button"
                  disabled={busy || !note.trim()}
                  onClick={() => void submit("request_change")}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-300 px-4 text-sm font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Sending…" : "Send badge change request"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-[310px] shrink-0 flex-col items-center">
          <div className="flex aspect-square w-full items-center justify-center overflow-visible rounded-[2rem] border border-white/10 bg-black/30 p-6 shadow-[0_22px_60px_rgba(0,0,0,0.35)]">
            {hasBadge ? (
              <img
                src={logoUrl ?? ""}
                alt={`${teamName} team badge`}
                onError={() => setImageFailed(true)}
                className="max-h-[88%] max-w-[88%] object-contain object-center"
              />
            ) : (
              <div className="text-center">
                <div className="text-6xl font-black text-white/20">
                  {teamName
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 3)
                    .map((word) => word[0]?.toUpperCase())
                    .join("") || "?"}
                </div>
                <div className="mt-3 text-sm font-semibold text-white/45">
                  No badge saved yet
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 text-center text-sm font-semibold text-white/70">
            {teamName}
          </div>
        </div>
      </div>
    </section>
  );
}
