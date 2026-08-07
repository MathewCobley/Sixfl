"use client";

import { useEffect, useMemo, useState } from "react";

type MissingFixtureWarning = {
  key: string;
  level: "amber" | "red" | "info";
  leagueId?: string;
  teamId?: string;
  teamName?: string;
  message: string;
};

type MissingFixturePayload = {
  selectedDate?: string;
  warnings?: MissingFixtureWarning[];
};

type SendState = {
  state: "sending" | "sent" | "error";
  message: string;
};

export default function NightBoardNoFixtureEmails({
  date,
  leagueId,
  venueId,
}: {
  date: string;
  leagueId: string;
  venueId: string;
}) {
  const [payload, setPayload] = useState<MissingFixturePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendStateByKey, setSendStateByKey] = useState<Record<string, SendState>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ date });
    if (leagueId) params.set("leagueId", leagueId);
    if (venueId) params.set("venueId", venueId);

    setLoading(true);
    setLoadError("");

    void fetch(`/api/admin/night-board/missing-team-fixtures?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const nextPayload = (await response.json().catch(() => null)) as
          | MissingFixturePayload
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(
            (nextPayload && "error" in nextPayload && nextPayload.error) ||
              "Could not check teams without fixtures.",
          );
        }
        if (!cancelled) setPayload((nextPayload ?? {}) as MissingFixturePayload);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not check teams without fixtures.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date, leagueId, venueId]);

  const missingTeams = useMemo(
    () =>
      (payload?.warnings ?? []).filter(
        (warning) =>
          warning.key.startsWith("missing-weekly-fixture:") &&
          Boolean(warning.teamId) &&
          Boolean(warning.leagueId),
      ),
    [payload],
  );

  async function sendEmail(warning: MissingFixtureWarning) {
    if (!warning.teamId || !warning.leagueId) return;
    if (sendStateByKey[warning.key]?.state === "sending") return;

    setSendStateByKey((current) => ({
      ...current,
      [warning.key]: { state: "sending", message: "Sending…" },
    }));

    try {
      const response = await fetch("/api/admin/night-board/no-fixture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: warning.teamId,
          leagueId: warning.leagueId,
          date,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; alreadySent?: boolean; message?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(result?.error || "The email could not be sent.");
      }

      setSendStateByKey((current) => ({
        ...current,
        [warning.key]: {
          state: "sent",
          message:
            result?.message ||
            (result?.alreadySent
              ? "Already queued or sent for this week."
              : "Email queued."),
        },
      }));
    } catch (error) {
      setSendStateByKey((current) => ({
        ...current,
        [warning.key]: {
          state: "error",
          message:
            error instanceof Error ? error.message : "The email could not be sent.",
        },
      }));
    }
  }

  return (
    <section className="rounded-3xl border border-sky-400/15 bg-sky-500/[0.04] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/60">
            Manual team contact
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Teams with no fixture this week
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Only teams with no published fixture and no recorded advance unavailability are shown. Nothing is sent automatically — use the button when you have checked the team should receive the capacity email.
          </p>
        </div>
        {!loading ? (
          <div className="text-3xl font-semibold text-sky-100">
            {missingTeams.length}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-white/50">
          Checking teams without fixtures…
        </div>
      ) : loadError ? (
        <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {loadError}
        </div>
      ) : missingTeams.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          No available teams currently need a no-fixture email for this week.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {missingTeams.map((warning) => {
            const sendState = sendStateByKey[warning.key];
            return (
              <div
                key={warning.key}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">
                      {warning.teamName || "Team"}
                    </div>
                    <div className="mt-1 text-sm leading-5 text-white/50">
                      No published fixture this week and no recorded team unavailability.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={sendState?.state === "sending" || sendState?.state === "sent"}
                    onClick={() => void sendEmail(warning)}
                    className="shrink-0 rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {sendState?.state === "sending"
                      ? "Sending…"
                      : sendState?.state === "sent"
                        ? "Email queued"
                        : "Send no-fixture email"}
                  </button>
                </div>
                {sendState ? (
                  <div
                    className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                      sendState.state === "error"
                        ? "border-red-400/20 bg-red-500/10 text-red-100"
                        : sendState.state === "sent"
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/[0.04] text-white/55"
                    }`}
                  >
                    {sendState.message}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
