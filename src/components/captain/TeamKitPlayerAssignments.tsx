"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { TEAM_KIT_QUANTITY, getTeamKitSizeLabel, type TeamKitSize } from "@/lib/kits/constants";

type Member = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  role: string;
};

type Assignment = {
  id: string;
  teamId: string;
  teamMemberId: string;
  position: number;
  token: string;
  status: "ASSIGNED" | "SENT" | "OPENED" | "COMPLETED";
  backName: string | null;
  shirtNumber: number | null;
  kitSize: TeamKitSize | null;
  sentAt: string | null;
  lastSentAt: string | null;
  openedAt: string | null;
  completedAt: string | null;
  playerName: string;
  playerEmail: string | null;
  dispatchStatus: string | null;
  dispatchSentAt: string | null;
  dispatchFailureReason: string | null;
};

type ApiResponse = {
  members: Member[];
  assignments: Assignment[];
  error?: string;
};

type Props = {
  teamId: string;
  initialMembers: Member[];
  initialAssignments: Assignment[];
  locked: boolean;
};

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusCopy(assignment: Assignment | undefined) {
  if (!assignment) {
    return {
      label: "Not assigned",
      className: "border-white/10 bg-white/[0.04] text-white/55",
      detail: "Choose a squad member or enter the details manually below.",
    };
  }

  if (assignment.dispatchStatus === "FAILED" || assignment.dispatchStatus === "SKIPPED") {
    return {
      label: "Email not delivered",
      className: "border-red-400/25 bg-red-500/10 text-red-100",
      detail: assignment.dispatchFailureReason || "Check the player's email address before trying again.",
    };
  }

  if (assignment.status === "COMPLETED") {
    return {
      label: "Completed by player",
      className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100",
      detail: assignment.completedAt
        ? `Completed ${formatDate(assignment.completedAt)}`
        : "Player details completed.",
    };
  }

  if (assignment.status === "OPENED") {
    return {
      label: "Link opened",
      className: "border-sky-400/25 bg-sky-500/10 text-sky-100",
      detail: assignment.openedAt
        ? `Opened ${formatDate(assignment.openedAt)} · waiting for completion`
        : "The player opened the link but has not completed it yet.",
    };
  }

  if (assignment.dispatchStatus === "QUEUED") {
    return {
      label: "Email queued",
      className: "border-violet-400/25 bg-violet-500/10 text-violet-100",
      detail: assignment.lastSentAt
        ? `Queued ${formatDate(assignment.lastSentAt)}`
        : "The email is waiting to be sent.",
    };
  }

  return {
    label: "Awaiting player",
    className: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    detail: assignment.dispatchSentAt
      ? `Email sent ${formatDate(assignment.dispatchSentAt)}`
      : assignment.lastSentAt
        ? `Link sent ${formatDate(assignment.lastSentAt)}`
        : "The player has not completed the form yet.",
  };
}

export default function TeamKitPlayerAssignments({
  teamId,
  initialMembers,
  initialAssignments,
  locked,
}: Props) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selectedByPosition, setSelectedByPosition] = useState<Record<number, string>>(() =>
    Object.fromEntries(initialAssignments.map((assignment) => [assignment.position, assignment.teamMemberId])),
  );
  const [busyPosition, setBusyPosition] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignmentByPosition = useMemo(
    () => new Map(assignments.map((assignment) => [assignment.position, assignment])),
    [assignments],
  );
  const completedCount = assignments.filter((assignment) => assignment.status === "COMPLETED").length;
  const waitingCount = assignments.filter((assignment) =>
    ["SENT", "OPENED"].includes(assignment.status),
  ).length;

  async function loadLatest(options?: { refreshPage?: boolean }) {
    const response = await fetch(`/api/captain/team/${encodeURIComponent(teamId)}/kit-player-assignments`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !payload) throw new Error(payload?.error || "Could not refresh kit assignments.");

    setMembers(payload.members);
    setAssignments(payload.assignments);
    setSelectedByPosition((current) => ({
      ...current,
      ...Object.fromEntries(payload.assignments.map((assignment) => [assignment.position, assignment.teamMemberId])),
    }));

    if (options?.refreshPage) router.refresh();
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadLatest({ refreshPage: true }).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [teamId]);

  async function submit(position: number, action: "assign" | "resend" | "clear") {
    setBusyPosition(position);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/captain/team/${encodeURIComponent(teamId)}/kit-player-assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            position,
            teamMemberId: selectedByPosition[position] || undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "The kit link could not be updated.");

      setMembers(payload.members);
      setAssignments(payload.assignments);
      if (action === "clear") {
        setSelectedByPosition((current) => ({ ...current, [position]: "" }));
        setMessage(`Kit ${position} is no longer assigned.`);
      } else {
        setMessage(`Kit ${position} link sent to the selected player.`);
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The kit assignment could not be updated.");
    } finally {
      setBusyPosition(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.045]">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">
              Player details
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Ask players to complete their own kit</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
              Assign a kit slot to a squad member and SIXFL will email them a secure form. Their name, number and size will fill into the order automatically. You can still enter any row manually.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBusyPosition(0);
              setError(null);
              void loadLatest({ refreshPage: true })
                .then(() => setMessage("Kit assignment statuses refreshed."))
                .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not refresh statuses."))
                .finally(() => setBusyPosition(null));
            }}
            disabled={busyPosition !== null}
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            Refresh statuses
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-100">
            {completedCount} completed
          </span>
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-100">
            {waitingCount} awaiting players
          </span>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/55">
            {TEAM_KIT_QUANTITY - assignments.length} not assigned
          </span>
        </div>
      </div>

      {message ? (
        <div className="border-b border-emerald-400/15 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-100 sm:px-6">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-red-400/15 bg-red-500/10 px-5 py-3 text-sm text-red-100 sm:px-6">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 p-4 sm:p-6 lg:grid-cols-2">
        {Array.from({ length: TEAM_KIT_QUANTITY }, (_, index) => index + 1).map((position) => {
          const assignment = assignmentByPosition.get(position);
          const status = statusCopy(assignment);
          const selectedMemberId = selectedByPosition[position] ?? "";
          const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null;
          const samePlayer = assignment?.teamMemberId === selectedMemberId;

          return (
            <div key={position} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Kit {position} of {TEAM_KIT_QUANTITY}</div>
                  {assignment ? (
                    <div className="mt-1 text-xs text-white/45">
                      {assignment.playerName}{assignment.playerEmail ? ` · ${assignment.playerEmail}` : ""}
                    </div>
                  ) : null}
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>
                  {status.label}
                </span>
              </div>

              <p className="mt-3 min-h-10 text-xs leading-5 text-white/50">{status.detail}</p>

              {assignment?.status === "COMPLETED" ? (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                    <div className="text-white/35">Back</div>
                    <div className="mt-1 truncate font-semibold text-white">{assignment.backName || "Number only"}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                    <div className="text-white/35">No.</div>
                    <div className="mt-1 font-semibold text-white">{assignment.shirtNumber}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                    <div className="text-white/35">Size</div>
                    <div className="mt-1 truncate font-semibold text-white">
                      {assignment.kitSize ? getTeamKitSizeLabel(assignment.kitSize) : "—"}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <select
                  value={selectedMemberId}
                  disabled={locked || busyPosition === position}
                  onChange={(event) =>
                    setSelectedByPosition((current) => ({
                      ...current,
                      [position]: event.target.value,
                    }))
                  }
                  className="h-11 min-w-0 rounded-xl border border-white/10 bg-[#0d1428] px-3 text-sm text-white outline-none focus:border-emerald-400/40 disabled:opacity-50"
                >
                  <option value="">Choose squad member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id} disabled={!member.email}>
                      {member.name}{member.email ? "" : " — no email saved"}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={
                    locked ||
                    busyPosition === position ||
                    !selectedMemberId ||
                    !selectedMember?.email
                  }
                  onClick={() => void submit(position, samePlayer ? "resend" : "assign")}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyPosition === position
                    ? "Sending…"
                    : samePlayer
                      ? assignment?.status === "COMPLETED"
                        ? "Send form again"
                        : "Resend email"
                      : "Send player link"}
                </button>
              </div>

              {assignment && !locked ? (
                <button
                  type="button"
                  disabled={busyPosition === position}
                  onClick={() => void submit(position, "clear")}
                  className="mt-2 text-xs font-semibold text-red-200/70 underline decoration-red-400/30 underline-offset-4 hover:text-red-100 disabled:opacity-50"
                >
                  Remove assignment
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
