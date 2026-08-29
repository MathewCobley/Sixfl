// ========================================
// File: src/components/admin/night-board/NightBoardSaveNotice.tsx
// ========================================

"use client";

import { useEffect, useState } from "react";

type SaveNotice = {
  kind: string;
  reason: string | null;
  notificationError: boolean;
  teamEmailQueued: number;
  teamEmailSkipped: number;
  teamEmailExisting: number;
  teamEmailFailed: number;
  teamSmsQueued: number;
  teamSmsSkipped: number;
  teamSmsExisting: number;
  teamSmsFailed: number;
  refereeEmailQueued: number;
  refereeEmailSkipped: number;
  refereeEmailExisting: number;
  refereeEmailFailed: number;
  refereeSmsQueued: number;
  refereeSmsSkipped: number;
  refereeSmsExisting: number;
  refereeSmsFailed: number;
  fixtureRemindersQueued: number;
  fixtureRemindersSkipped: number;
};

const NOTICE_KEYS = [
  "matchSaved",
  "notificationKind",
  "notificationReason",
  "notificationError",
  "teamEmailQueued",
  "teamEmailSkipped",
  "teamEmailExisting",
  "teamEmailFailed",
  "teamSmsQueued",
  "teamSmsSkipped",
  "teamSmsExisting",
  "teamSmsFailed",
  "refereeEmailQueued",
  "refereeEmailSkipped",
  "refereeEmailExisting",
  "refereeEmailFailed",
  "refereeSmsQueued",
  "refereeSmsSkipped",
  "refereeSmsExisting",
  "refereeSmsFailed",
  "fixtureRemindersQueued",
  "fixtureRemindersSkipped",
] as const;

function readCount(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key) ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function countLabel(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

function queuedLabels(notice: SaveNotice) {
  return [
    notice.teamEmailQueued
      ? countLabel(notice.teamEmailQueued, "team email")
      : null,
    notice.teamSmsQueued
      ? countLabel(notice.teamSmsQueued, "team SMS", "team SMS")
      : null,
    notice.refereeEmailQueued
      ? countLabel(notice.refereeEmailQueued, "referee email")
      : null,
    notice.refereeSmsQueued
      ? countLabel(notice.refereeSmsQueued, "referee SMS", "referee SMS")
      : null,
  ].filter((label): label is string => Boolean(label));
}

function missedLabels(notice: SaveNotice) {
  const teamMissed =
    notice.teamEmailSkipped +
    notice.teamEmailFailed +
    notice.teamSmsSkipped +
    notice.teamSmsFailed;
  const refereeMissed =
    notice.refereeEmailSkipped +
    notice.refereeEmailFailed +
    notice.refereeSmsSkipped +
    notice.refereeSmsFailed;

  return [
    teamMissed ? countLabel(teamMissed, "team message") : null,
    refereeMissed ? countLabel(refereeMissed, "referee message") : null,
  ].filter((label): label is string => Boolean(label));
}

function existingTotal(notice: SaveNotice) {
  return (
    notice.teamEmailExisting +
    notice.teamSmsExisting +
    notice.refereeEmailExisting +
    notice.refereeSmsExisting
  );
}

function buildNoticeCopy(notice: SaveNotice) {
  const queued = queuedLabels(notice);
  const missed = missedLabels(notice);
  const existing = existingTotal(notice);

  if (notice.notificationError) {
    return {
      tone: "error" as const,
      title: "Match saved — notification check failed",
      detail:
        notice.reason ||
        "The match was saved, but SIXFL could not finish queuing the change notifications. Contact the teams and referee manually.",
    };
  }

  if (missed.length > 0) {
    const sentPart = queued.length > 0 ? `${joinLabels(queued)} queued. ` : "";
    return {
      tone: "warning" as const,
      title: "Match saved — some messages need attention",
      detail: `${sentPart}${joinLabels(
        missed,
      )} could not be queued. Check the team and referee contact details and contact them manually where needed.`,
    };
  }

  if (queued.length > 0) {
    const reminderPart = notice.fixtureRemindersQueued
      ? ` ${countLabel(
          notice.fixtureRemindersQueued,
          "future fixture reminder",
        )} also rescheduled.`
      : "";
    return {
      tone: "success" as const,
      title: "Match saved and notifications queued",
      detail: `${joinLabels(queued)} queued.${reminderPart}`,
    };
  }

  if (existing > 0) {
    return {
      tone: "info" as const,
      title: "Match saved",
      detail: `${countLabel(
        existing,
        "notification",
      )} for this exact change had already been queued or sent, so SIXFL did not duplicate it.`,
    };
  }

  return {
    tone: "info" as const,
    title: "Match saved",
    detail:
      notice.reason ||
      "No material fixture details changed, so no team or referee notification was needed.",
  };
}

export default function NightBoardSaveNotice() {
  const [notice, setNotice] = useState<SaveNotice | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/admin/night-board") return;

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("matchSaved") !== "1") return;

    setNotice({
      kind: searchParams.get("notificationKind") || "none",
      reason: searchParams.get("notificationReason"),
      notificationError: searchParams.get("notificationError") === "1",
      teamEmailQueued: readCount(searchParams, "teamEmailQueued"),
      teamEmailSkipped: readCount(searchParams, "teamEmailSkipped"),
      teamEmailExisting: readCount(searchParams, "teamEmailExisting"),
      teamEmailFailed: readCount(searchParams, "teamEmailFailed"),
      teamSmsQueued: readCount(searchParams, "teamSmsQueued"),
      teamSmsSkipped: readCount(searchParams, "teamSmsSkipped"),
      teamSmsExisting: readCount(searchParams, "teamSmsExisting"),
      teamSmsFailed: readCount(searchParams, "teamSmsFailed"),
      refereeEmailQueued: readCount(searchParams, "refereeEmailQueued"),
      refereeEmailSkipped: readCount(searchParams, "refereeEmailSkipped"),
      refereeEmailExisting: readCount(searchParams, "refereeEmailExisting"),
      refereeEmailFailed: readCount(searchParams, "refereeEmailFailed"),
      refereeSmsQueued: readCount(searchParams, "refereeSmsQueued"),
      refereeSmsSkipped: readCount(searchParams, "refereeSmsSkipped"),
      refereeSmsExisting: readCount(searchParams, "refereeSmsExisting"),
      refereeSmsFailed: readCount(searchParams, "refereeSmsFailed"),
      fixtureRemindersQueued: readCount(
        searchParams,
        "fixtureRemindersQueued",
      ),
      fixtureRemindersSkipped: readCount(
        searchParams,
        "fixtureRemindersSkipped",
      ),
    });
  }, []);

  if (!notice) return null;

  const copy = buildNoticeCopy(notice);
  const toneClass =
    copy.tone === "success"
      ? "border-emerald-400/35 bg-emerald-950/95 text-emerald-50"
      : copy.tone === "error"
        ? "border-red-400/40 bg-red-950/95 text-red-50"
        : copy.tone === "warning"
          ? "border-amber-400/40 bg-amber-950/95 text-amber-50"
          : "border-sky-400/35 bg-sky-950/95 text-sky-50";

  function dismiss() {
    const url = new URL(window.location.href);
    for (const key of NOTICE_KEYS) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setNotice(null);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-4 top-20 z-[90] w-[min(34rem,calc(100vw-2rem))] rounded-2xl border px-4 py-4 shadow-2xl backdrop-blur ${toneClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">{copy.title}</div>
          <div className="mt-1 text-xs leading-5 opacity-85">
            {copy.detail}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-xs font-semibold opacity-80 transition hover:opacity-100"
          aria-label="Dismiss match save notification"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
