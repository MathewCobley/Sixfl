"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamMemberSquadStatus } from "@/lib/managed-squad/squadStatus";

type InjuryStatus = "ACTIVE" | "INJURED";
export type InjuryPanelMember = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  squadStatus: TeamMemberSquadStatus;
  squadStatusUpdatedAt: string | null;
  squadStatusNote: string | null;
};
type StatusPayload = { members?: InjuryPanelMember[]; error?: string; ok?: boolean; squadStatus?: string };
function memberName(member: InjuryPanelMember) {
  return member.name?.trim() || member.email?.trim() || "Unnamed player";
}

export function SquadInjuryRows({ members, notes, busy, onNote, onUpdate }: {
  members: InjuryPanelMember[];
  notes: Record<string, string>;
  busy: string | null;
  onNote: (id: string, note: string) => void;
  onUpdate: (member: InjuryPanelMember, status: InjuryStatus) => void;
}) {
  const current = members.filter(member => member.squadStatus === "ACTIVE" || member.squadStatus === "INJURED");
  const inactive = members.filter(member => member.squadStatus === "INACTIVE");
  const unknown = members.filter(member => !["ACTIVE", "INJURED", "INACTIVE"].includes(member.squadStatus));
  return <div className="min-w-0">
    {current.length === 0 && <p className="p-4 text-sm text-white/60">No current players to manage here.</p>}
    <div className="divide-y divide-white/10">{current.map(member => {
      const injured = member.squadStatus === "INJURED";
      return <article key={member.id} data-squad-injury-member={member.id} className="grid min-w-0 gap-4 p-4 sm:p-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 font-semibold text-white [overflow-wrap:anywhere]">{memberName(member)}</h3>
            <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/60">{member.role.replaceAll("_", " ")}</span>
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${injured ? "border-red-400/30 text-red-100" : "border-emerald-400/30 text-emerald-100"}`}>{injured ? "Injured — unavailable" : "Available"}</span>
          </div>
          <p className="text-sm text-white/50 [overflow-wrap:anywhere]">{member.email || "No email on account"}</p>
          {injured && member.squadStatusNote && <p className="text-sm text-red-100/80 [overflow-wrap:anywhere]">Injury note: {member.squadStatusNote}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {!injured && <label className="min-w-0 text-xs text-white/65">Optional injury note
            <input value={notes[member.id] ?? ""} disabled={busy !== null} onChange={event => onNote(member.id, event.target.value)} aria-label={`Injury note for ${memberName(member)}`} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none focus:border-emerald-400" />
          </label>}
          <button type="button" disabled={busy !== null} onClick={() => onUpdate(member, injured ? "ACTIVE" : "INJURED")} className={`min-h-11 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${injured ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-red-400/30 bg-red-500/10 text-red-100"}`}>
            {busy === member.id ? "Saving…" : injured ? "Mark available" : "Mark injured"}
          </button>
        </div>
      </article>;
    })}</div>
    {inactive.length > 0 && <details className="m-4 rounded-xl border border-white/10 bg-black/20 p-4" data-inactive-squad-history>
      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-white/70">Inactive / former players ({inactive.length})</summary>
      <p className="mt-2 text-sm text-white/50">These players remain inactive. They are not available for selection and cannot be marked injured here.</p>
      <ul className="mt-3 space-y-3">{inactive.map(member => <li key={member.id} data-squad-injury-member={member.id} className="min-w-0 border-t border-white/10 pt-3 text-sm [overflow-wrap:anywhere]">
        <span className="font-semibold text-white/75">{memberName(member)}</span><span className="ml-2 text-white/50">Inactive</span>
        {member.squadStatusNote && <p className="mt-1 text-white/45">{member.squadStatusNote}</p>}
      </li>)}</ul>
    </details>}
    {unknown.length > 0 && <p role="alert" className="p-4 text-sm text-amber-100">Some player statuses could not be recognised. Their injury controls are unavailable; reload before making changes.</p>}
  </div>;
}

// Keep the legacy export path compatible with the old captain layout's no-op
// mount. Only the authenticated admin squad route supplies a teamId. There is
// no pathname discovery, global markup injection or captain-side status fetch.
export default function ManagedSquadInjuryBridge({ teamId = "" }: { teamId?: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<InjuryPanelMember[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadedTeamId, setLoadedTeamId] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const updateLock = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!teamId || !expanded) return;
    const controller = new AbortController();
    setLoading(true); setLoadedTeamId(""); setError("");
    void fetch(`/api/admin/managed-squad-status?teamId=${encodeURIComponent(teamId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => null) as StatusPayload | null;
        if (!response.ok || !Array.isArray(payload?.members)) throw new Error(payload?.error || "Could not load squad availability.");
        if (controller.signal.aborted) return;
        setMembers(payload.members);
        setNotes(Object.fromEntries(payload.members.map(member => [member.id, member.squadStatusNote ?? ""])));
        setLoadedTeamId(teamId);
      })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load squad availability."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [teamId, expanded, reload]);

  async function updateStatus(member: InjuryPanelMember, status: InjuryStatus) {
    if (!teamId || loadedTeamId !== teamId || updateLock.current || !["ACTIVE", "INJURED"].includes(member.squadStatus)) return;
    updateLock.current = true; setUpdatingId(member.id); setError(""); setSuccess("");
    try {
      const note = status === "INJURED" ? notes[member.id]?.trim() || null : null;
      const response = await fetch("/api/admin/managed-squad-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId, membershipId: member.id, squadStatus: status, note }) });
      const payload = await response.json().catch(() => null) as StatusPayload | null;
      if (!response.ok || !payload?.ok || payload.squadStatus !== status) throw new Error(payload?.error || "Could not update injury status. Your change has not been confirmed.");
      setMembers(current => current.map(item => item.id === member.id ? { ...item, squadStatus: status, squadStatusNote: note } : item));
      if (status === "ACTIVE") setNotes(current => ({ ...current, [member.id]: "" }));
      setSuccess(`${memberName(member)} marked ${status === "INJURED" ? "injured" : "available"}.`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update injury status."); }
    finally { updateLock.current = false; setUpdatingId(null); }
  }

  if (!teamId) return null;
  return <details data-squad-injury-panel open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="min-w-0 rounded-2xl border border-white/15 bg-white/[0.03]">
    <summary className="min-h-12 cursor-pointer rounded-2xl p-4 font-semibold text-white sm:p-5">Player injuries and availability</summary>
    {expanded && <div className="min-w-0 border-t border-white/10">
      <p className="p-4 text-sm leading-6 text-white/60">Manage injuries separately from squad membership. Injured players are unavailable for selection and availability chases until marked available again. Existing inactive players remain inactive.</p>
      {error && <div className="space-y-2 px-4 pb-4"><p role="alert" className="text-sm text-red-100">{error}</p>{loadedTeamId !== teamId && <button type="button" onClick={() => setReload(value => value + 1)} className="min-h-11 rounded-xl border border-white/20 px-4 text-sm text-white">Retry loading</button>}</div>}
      {success && <p role="status" className="px-4 pb-4 text-sm text-emerald-100">{success}</p>}
      {loading ? <p role="status" className="p-4 text-sm text-white/60">Loading squad availability…</p> : loadedTeamId === teamId ? <SquadInjuryRows members={members} notes={notes} busy={updatingId} onNote={(id, note) => setNotes(current => ({ ...current, [id]: note }))} onUpdate={(member, status) => void updateStatus(member, status)} /> : null}
    </div>}
  </details>;
}
