"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  queuePlayerProspectSquadInviteChaseAction,
  queuePlayerProspectSquadInviteFinalChaseAction,
} from "@/app/(admin)/admin/player-prospects/actions";

export type ProspectTeamOption = {
  value: string;
  label: string;
};

export type ProspectPlayerPoolProfile = {
  id: string;
  publicCode: string;
  status: string;
  invitedAt: string | null;
  profileSubmittedAt: string | null;
  updatedAt: string;
};

export type ProspectChaseStatus = {
  chaseStatus: string | null;
  chaseAt: string | null;
  finalChaseStatus: string | null;
  finalChaseAt: string | null;
};

type Notice = {
  tone: "success" | "warning" | "error";
  text: string;
};

type Props = {
  prospectId: string;
  playerName: string;
  currentTeamId: string | null;
  hasEmail: boolean;
  isClosed: boolean;
  isActivePlayer: boolean;
  latestPlayerResponse: string | null;
  latestSigninEmailStatus: string | null;
  selectedLeagueId: string;
  teamOptions: ProspectTeamOption[];
  playerPoolProfile: ProspectPlayerPoolProfile | null;
  chaseStatus: ProspectChaseStatus | null;
};

function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function playerPoolStatusClasses(status: string) {
  switch (status) {
    case "INVITED":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "AVAILABLE":
    case "INTRODUCTION_REQUESTED":
    case "TRIAL_ARRANGED":
      return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
    case "JOINED":
      return "border-sky-400/30 bg-sky-500/10 text-sky-100";
    case "PAUSED":
      return "border-violet-400/30 bg-violet-500/10 text-violet-100";
    case "NOT_LOOKING":
      return "border-red-400/30 bg-red-500/10 text-red-100";
    default:
      return "border-white/15 bg-white/[0.05] text-white/75";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
}

function chaseStatusText(status: ProspectChaseStatus | null) {
  if (!status) return null;

  if (status.finalChaseAt || status.finalChaseStatus) {
    const when = formatDateTime(status.finalChaseAt);
    return `Final chase ${statusLabel(status.finalChaseStatus ?? "RECORDED").toLowerCase()}${when ? ` ${when}` : ""}`;
  }

  if (status.chaseAt || status.chaseStatus) {
    const when = formatDateTime(status.chaseAt);
    return `Chase ${statusLabel(status.chaseStatus ?? "RECORDED").toLowerCase()}${when ? ` ${when}` : ""}`;
  }

  return null;
}

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export default function ProspectNativeActions({
  prospectId,
  playerName,
  currentTeamId,
  hasEmail,
  isClosed,
  isActivePlayer,
  latestPlayerResponse,
  latestSigninEmailStatus,
  selectedLeagueId,
  teamOptions,
  playerPoolProfile,
  chaseStatus,
}: Props) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showTeamChange, setShowTeamChange] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState("");
  const [sendFreshInvite, setSendFreshInvite] = useState(true);

  const availableTeams = useMemo(
    () => teamOptions.filter((team) => team.value !== currentTeamId),
    [currentTeamId, teamOptions],
  );

  const hasSquadInviteHistory = Boolean(
    latestSigninEmailStatus &&
      ["SENT", "QUEUED", "PROCESSING", "RECORDED"].includes(
        latestSigninEmailStatus,
      ),
  );
  const canChaseInvite = Boolean(
    currentTeamId &&
      hasEmail &&
      !isClosed &&
      !isActivePlayer &&
      !latestPlayerResponse &&
      hasSquadInviteHistory,
  );
  const canUsePlayerPool = Boolean(
    hasEmail &&
      !isClosed &&
      !isActivePlayer &&
      (!currentTeamId ||
        (hasSquadInviteHistory && latestPlayerResponse !== "NO")),
  );

  async function runProspectPost(input: {
    action: string;
    endpoint: string;
    confirmation?: string;
    success: string;
  }) {
    if (input.confirmation && !window.confirm(input.confirmation)) return;

    setBusyAction(input.action);
    setNotice(null);

    try {
      const response = await fetch(input.endpoint, { method: "POST" });
      const payload = await readJson<{ ok?: boolean; error?: string }>(response);

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || "That change could not be saved.");
      }

      setNotice({ tone: "success", text: input.success });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "That change could not be saved.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function changeTeam() {
    if (!targetTeamId) return;
    const selectedTeam = availableTeams.find(
      (team) => team.value === targetTeamId,
    );
    const inviteCopy = sendFreshInvite
      ? " A fresh squad invite will also be queued."
      : " No new invite will be sent.";

    if (
      !window.confirm(
        `Move ${playerName} to ${selectedTeam?.label ?? "the selected team"}?${inviteCopy}`,
      )
    ) {
      return;
    }

    setBusyAction("change-team");
    setNotice(null);

    try {
      const response = await fetch("/api/admin/player-prospects/change-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId,
          teamId: targetTeamId,
          sendInvite: sendFreshInvite,
        }),
      });
      const payload = await readJson<{
        ok?: boolean;
        teamName?: string;
        inviteQueued?: boolean;
        warning?: string | null;
        error?: string;
      }>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "The player's team could not be changed.");
      }

      setNotice({
        tone: payload.warning ? "warning" : "success",
        text:
          payload.warning ||
          `${playerName} has been moved to ${payload.teamName ?? "the selected team"}${payload.inviteQueued ? " and a fresh squad invite was queued" : ""}.`,
      });
      setShowTeamChange(false);
      setTargetTeamId("");
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The player's team could not be changed.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function sendToPlayerPool() {
    const existingProfile = Boolean(playerPoolProfile);
    const confirmed = window.confirm(
      existingProfile
        ? `Resend ${playerName}'s SIXFL PlayerPool profile form?`
        : currentTeamId
          ? `Add ${playerName} to SIXFL PlayerPool? Their current team prospect assignment will be kept while the PlayerPool profile form is sent.`
          : `Send ${playerName} a SIXFL PlayerPool profile form?`,
    );
    if (!confirmed) return;

    setBusyAction("player-pool");
    setNotice(null);

    try {
      const response = await fetch(
        `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/player-pool`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leagueId: selectedLeagueId || null }),
        },
      );
      const payload = await readJson<{ ok?: boolean; message?: string; error?: string }>(
        response,
      );

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "The PlayerPool form could not be sent.",
        );
      }

      setNotice({
        tone: "success",
        text: currentTeamId
          ? existingProfile
            ? `PlayerPool form resent for ${playerName}. Their current team prospect assignment has been kept.`
            : `${playerName} has been added to PlayerPool and sent the profile form. Their current team prospect assignment has been kept.`
          : payload.message || "PlayerPool form sent.",
      });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The PlayerPool form could not be sent.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function sendChase(final: boolean) {
    const label = final ? "final chase" : "chase";
    if (!window.confirm(`Send ${playerName} a ${label} email?`)) return;

    setBusyAction(final ? "final-chase" : "chase");
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("prospectId", prospectId);
      const result = final
        ? await queuePlayerProspectSquadInviteFinalChaseAction(formData)
        : await queuePlayerProspectSquadInviteChaseAction(formData);

      if (!result?.ok) {
        throw new Error(result?.error || "The chase email could not be queued.");
      }

      setNotice({
        tone: "success",
        text: final
          ? "Final squad invite chase queued."
          : "Squad invite chase queued.",
      });
      router.refresh();
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The chase email could not be queued.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (isClosed || isActivePlayer) return null;

  const chaseText = chaseStatusText(chaseStatus);

  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        Prospect actions
      </p>

      {canChaseInvite ? (
        <div className="space-y-2 rounded-2xl border border-sky-400/20 bg-sky-500/[0.08] p-3">
          <p className="text-xs leading-5 text-sky-100/75">
            The squad invite has been sent but the player has not replied.
          </p>
          {chaseText ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/65">
              {chaseText}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void sendChase(false)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-wait disabled:opacity-50"
            >
              {busyAction === "chase" ? "Queuing…" : "Chase invite"}
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void sendChase(true)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50"
            >
              {busyAction === "final-chase" ? "Queuing…" : "Final chase"}
            </button>
          </div>
        </div>
      ) : null}

      {currentTeamId ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busyAction !== null || availableTeams.length === 0}
            onClick={() => setShowTeamChange((current) => !current)}
            className="inline-flex w-full items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showTeamChange ? "Hide team change" : "Change team"}
          </button>

          {showTeamChange ? (
            <div className="space-y-3 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.08] p-3">
              <label className="block space-y-2 text-xs font-semibold text-cyan-100">
                <span>Move player to</span>
                <select
                  value={targetTeamId}
                  onChange={(event) => setTargetTeamId(event.target.value)}
                  className="h-11 w-full rounded-xl border border-white/15 bg-black/70 px-3 text-sm text-white outline-none transition focus:border-cyan-300"
                >
                  <option value="">Choose new team</option>
                  {availableTeams.map((team) => (
                    <option key={team.value} value={team.value}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/70">
                <input
                  type="checkbox"
                  checked={sendFreshInvite}
                  onChange={(event) => setSendFreshInvite(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-emerald-500"
                />
                <span>
                  Send a fresh squad invite for the new team. This is recommended
                  when an earlier invite named the old team.
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!targetTeamId || busyAction !== null}
                  onClick={() => void changeTeam()}
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2.5 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyAction === "change-team" ? "Changing…" : "Confirm change"}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    setShowTeamChange(false);
                    setTargetTeamId("");
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              void runProspectPost({
                action: "unassign",
                endpoint: `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/unassign`,
                confirmation: `Move ${playerName} back to the main prospect pool?`,
                success: `${playerName} has been moved back to the main prospect pool.`,
              })
            }
            className="inline-flex w-full items-center justify-center rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-2.5 text-sm font-medium text-sky-100 transition hover:bg-sky-500/15 disabled:cursor-wait disabled:opacity-50"
          >
            {busyAction === "unassign" ? "Moving…" : "Move to main prospects"}
          </button>
        </div>
      ) : null}

      {canUsePlayerPool ? (
        <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-emerald-100">PlayerPool</p>
            {playerPoolProfile ? (
              <span
                title={`PlayerPool profile ${playerPoolProfile.publicCode}`}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${playerPoolStatusClasses(playerPoolProfile.status)}`}
              >
                {statusLabel(playerPoolProfile.status)}
              </span>
            ) : null}
          </div>
          {currentTeamId ? (
            <p className="text-xs leading-5 text-emerald-100/65">
              This player has been invited to a squad but is not active in it yet.
              You can also add them to PlayerPool without removing their current
              team prospect assignment.
            </p>
          ) : null}
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void sendToPlayerPool()}
            className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/15 disabled:cursor-wait disabled:opacity-50"
          >
            {busyAction === "player-pool"
              ? "Sending…"
              : playerPoolProfile?.status === "INVITED"
                ? "Resend PlayerPool invite"
                : playerPoolProfile
                  ? "Resend PlayerPool form"
                  : currentTeamId
                    ? "Add to PlayerPool"
                    : "Send to PlayerPool"}
          </button>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() =>
            void runProspectPost({
              action: "not-interested",
              endpoint: `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/not-interested`,
              confirmation: `Move ${playerName} to Not interested?`,
              success: `${playerName} has been moved to Not interested.`,
            })
          }
          className="inline-flex w-full items-center justify-center rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-100 transition hover:bg-red-500/15 disabled:cursor-wait disabled:opacity-50"
        >
          {busyAction === "not-interested" ? "Moving…" : "Move to not interested"}
        </button>

        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() =>
            void runProspectPost({
              action: "duplicate",
              endpoint: `/api/admin/player-prospects/${encodeURIComponent(prospectId)}/duplicate`,
              confirmation:
                "Mark this prospect as a duplicate record? It will leave the open pipeline and move to the duplicated records section.",
              success: `${playerName} has been moved to Duplicated.`,
            })
          }
          className="inline-flex w-full items-center justify-center rounded-xl border border-orange-400/25 bg-orange-500/10 px-4 py-2.5 text-sm font-medium text-orange-100 transition hover:bg-orange-500/15 disabled:cursor-wait disabled:opacity-50"
        >
          {busyAction === "duplicate" ? "Moving…" : "Remove duplicate"}
        </button>
      </div>

      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-3 py-2 text-xs leading-5 ${
            notice.tone === "success"
              ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
              : notice.tone === "warning"
                ? "border-amber-400/25 bg-amber-500/10 text-amber-100"
                : "border-red-400/25 bg-red-500/10 text-red-100"
          }`}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}
