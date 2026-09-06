"use client";

import { useEffect, useId, useRef, useState } from "react";
import { saveTeamMoveConfirmation } from "@/app/(admin)/admin/teams/move-confirmation-actions";
import {
  TEAM_MOVE_CONFIRMATION_OPTIONS,
  isTeamMoveConfirmationStatus,
  type TeamMoveConfirmationStatus,
} from "@/lib/teams/move-confirmation";

type Props = {
  enabled: boolean;
  teamId: string;
  teamName: string;
  initialStatus: string;
  initialUpdatedAt?: string | null;
  initialUpdatedBy?: string | null;
};

const tones: Record<TeamMoveConfirmationStatus, string> = {
  PENDING: "border-amber-400/30 text-amber-100",
  CONFIRMED: "border-emerald-400/40 text-emerald-100",
  DECLINED: "border-red-400/30 text-red-100",
};

function timestamp(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  }).format(date);
}

export default function TeamMoveConfirmationSelect({
  enabled, teamId, teamName, initialStatus, initialUpdatedAt, initialUpdatedBy,
}: Props) {
  const id = useId();
  const [status, setStatus] = useState<TeamMoveConfirmationStatus>(
    isTeamMoveConfirmationStatus(initialStatus) ? initialStatus : "PENDING",
  );
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [updatedBy, setUpdatedBy] = useState(initialUpdatedBy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (isTeamMoveConfirmationStatus(initialStatus)) setStatus(initialStatus);
    setUpdatedAt(initialUpdatedAt);
    setUpdatedBy(initialUpdatedBy);
  }, [initialStatus, initialUpdatedAt, initialUpdatedBy]);

  async function changeStatus(value: string) {
    if (!enabled || inFlight.current || !isTeamMoveConfirmationStatus(value) || value === status) return;
    const previousStatus = status;
    inFlight.current = true;
    setStatus(value);
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const result = await saveTeamMoveConfirmation({ teamId, status: value, previousStatus });
      if (!result.ok) {
        setStatus(previousStatus);
        setError(result.error);
        return;
      }
      setStatus(result.status);
      setUpdatedAt(result.updatedAt);
      setUpdatedBy(result.updatedBy);
      setSaved(true);
    } catch {
      setStatus(previousStatus);
      setError("Could not save. Check your connection and sign-in, then try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  // Render nothing unless the owning league explicitly enables tracking.
  if (!enabled) return null;

  return (
    <div className="w-full min-w-0 max-w-sm space-y-1.5" data-team-move-confirmation={teamId}>
      <label htmlFor={id} className="block text-xs font-semibold text-white/65">Move confirmation</label>
      <select
        id={id}
        aria-label={`Move confirmation for ${teamName}`}
        aria-describedby={`${id}-feedback`}
        aria-invalid={Boolean(error)}
        value={status}
        disabled={saving}
        onChange={event => void changeStatus(event.target.value)}
        className={`w-full min-w-0 rounded-xl border bg-[#0b1411] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-400 disabled:cursor-wait disabled:opacity-60 ${tones[status]}`}
      >
        {TEAM_MOVE_CONFIRMATION_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <div id={`${id}-feedback`} role="status" aria-live="polite" className="break-words text-xs leading-5 text-white/50">
        {saving ? "Saving…" : saved ? "Saved." : "Saves automatically."}
        {!saving && updatedAt ? ` Last updated ${timestamp(updatedAt)}${updatedBy ? ` by ${updatedBy}` : ""}.` : ""}
      </div>
      {error ? <p role="alert" className="text-xs leading-5 text-red-200">{error}</p> : null}
    </div>
  );
}
