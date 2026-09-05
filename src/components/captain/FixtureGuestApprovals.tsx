"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Approval = {
  id: string; playerUserId: string; playerName: string; status: "APPROVED" | "REVOKED";
  revision: number; approvedAt: string; approvedByName?: string; reason?: string;
  revokedAt: string | null; revokedByName?: string | null; revocationReason?: string | null;
};
type Candidate = { id: string; name: string; email: string | null; teams: string };
type Payload = {
  canManage: boolean;
  fixture: { id: string; teamName: string; opponentName: string; kickoffAt: string; status: string; editable: boolean };
  approvals: Approval[]; candidates: Candidate[];
};
const inputStyle = "w-full rounded-xl border border-white/20 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400 disabled:opacity-50";
const buttonStyle = "rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
}).format(new Date(value));

async function readResponse(response: Response) {
  if (response.redirected) throw new Error("Your session may have expired. Sign in again, then reload this fixture.");
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.error || "The guest approval request failed. Reload before trying again.");
  if (!value) throw new Error("The server response could not be read. Reload before trying again.");
  return value;
}

export default function FixtureGuestApprovals({ teamId, canManage }: { teamId: string; canManage: boolean }) {
  const fixtureId = useSearchParams().get("fixtureId") || "";
  if (!fixtureId) return canManage ? (
    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5">
      <h2 className="text-lg font-semibold text-white">Guest approvals</h2>
      <p className="mt-2 text-sm leading-6 text-white/70">Choose the match in the fixture selector below and open it to approve a guest. Approval applies to one named player and one fixture only.</p>
    </section>
  ) : null;
  return <GuestApprovalPanel key={`${teamId}:${fixtureId}`} teamId={teamId} fixtureId={fixtureId} canManage={canManage} />;
}

function GuestApprovalPanel({ teamId, fixtureId, canManage }: { teamId: string; fixtureId: string; canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [reason, setReason] = useState("");
  const [revoke, setRevoke] = useState<Approval | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const endpoint = `/api/captain/team/${encodeURIComponent(teamId)}/guest-approvals`;
  const readUrl = `${endpoint}?fixtureId=${encodeURIComponent(fixtureId)}`;
  const editable = Boolean(canManage && data?.canManage && data.fixture.editable);

  useEffect(() => {
    const controller = new AbortController();
    fetch(readUrl, { cache: "no-store", signal: controller.signal })
      .then(readResponse).then((value: Payload) => setData(value))
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [readUrl]);

  async function reload() {
    setLoading(true);
    try { setData(await readResponse(await fetch(readUrl, { cache: "no-store" })) as Payload); }
    finally { setLoading(false); }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2 || !editable) return;
    setSearching(true); setError(""); setSelected(null); setCandidates([]); setSearched(false);
    try {
      const result = await readResponse(await fetch(`${readUrl}&q=${encodeURIComponent(query.trim())}`, { cache: "no-store" })) as Payload;
      setData(result); setCandidates(result.candidates); setSearched(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Player search failed."); }
    finally { setSearching(false); }
  }

  async function decide(playerUserId: string, decision: "approve" | "revoke", note: string) {
    if (!data || !editable || busy) return;
    const existing = data.approvals.find((row) => row.playerUserId === playerUserId);
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, playerUserId, decision, reason: note,
          expectedRevision: existing?.revision ?? null, expectedKickoffAt: data.fixture.kickoffAt }),
      });
      await readResponse(response);
      setMessage(decision === "approve"
        ? "Guest approved for this fixture. Permanent registration and payments are unchanged."
        : "Guest approval revoked for this fixture. Existing selection and payments have not been changed; review them separately if needed.");
      setSelected(null); setCandidates([]); setSearched(false); setQuery(""); setReason("");
      setRevoke(null); setRevokeReason(""); setShowForm(false);
      await reload(); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The save could not be confirmed. Reload before trying again.");
    } finally { setBusy(false); }
  }

  return (
    <section id="guest-approvals" className="rounded-3xl border border-emerald-400/25 bg-emerald-500/[0.06] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Fixture-specific permission</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Guest approvals</h2>
          {data ? <p className="mt-2 text-sm text-white/75">For <strong>{data.fixture.teamName}</strong> vs {data.fixture.opponentName} · {dateTime(data.fixture.kickoffAt)} (UK)</p> : null}
        </div>
        {editable ? <button type="button" disabled={busy} className={buttonStyle} onClick={() => setShowForm(!showForm)}>Approve guest for this fixture</button> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-white/60">Permission only—not confirmation that the player has played. This does not add a permanent squad member, change selection, create a fee, waive payment or send a message. Normal guest and matchday squad limits still apply.</p>
      {loading ? <p role="status" className="mt-3 text-sm text-white/70">Loading guest approvals…</p> : null}
      {error ? <div role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}<button type="button" disabled={busy || loading} className="ml-3 underline" onClick={() => { setError(""); void reload().catch((err: Error) => setError(err.message)); }}>Reload approvals</button></div> : null}
      {message ? <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</p> : null}
      {data && !data.fixture.editable ? <p className="mt-3 text-sm text-amber-100">Read-only: approvals cannot be added, revoked or backdated after kick-off, or while a fixture is not scheduled.</p> : null}
      {showForm && editable && data ? (
        <div className="mt-5 space-y-4 rounded-2xl border border-white/15 bg-black/20 p-4">
          <form onSubmit={search} className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-sm text-white">Find an existing player by name or email
              <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); setCandidates([]); setSearched(false); }} minLength={2} maxLength={80} required disabled={busy || searching} className={`mt-2 ${inputStyle}`} placeholder="Enter at least two characters" />
            </label>
            <button className={buttonStyle} disabled={busy || searching || query.trim().length < 2}>{searching ? "Searching…" : "Find player"}</button>
          </form>
          {searched && candidates.length === 0 ? <p className="text-sm text-white/65">No matching player found. Permanent members of this team are excluded.</p> : null}
          {candidates.length > 0 ? <div className="max-h-64 space-y-2 overflow-y-auto">
            {candidates.map((player) => {
              const approved = data.approvals.some((a) => a.playerUserId === player.id && a.status === "APPROVED");
              return <button key={player.id} type="button" disabled={approved || busy} aria-pressed={selected?.id === player.id} onClick={() => setSelected(player)} className={`block w-full rounded-xl border p-3 text-left text-sm disabled:opacity-50 ${selected?.id === player.id ? "border-emerald-300 bg-emerald-500/15" : "border-white/15 bg-white/[0.03]"}`}>
                <span className="font-semibold text-white">{player.name}{approved ? " — already approved" : ""}</span>
                <span className="mt-1 block break-all text-white/60">{player.email || "No email saved"}</span>
                <span className="mt-1 block text-white/55">Permanent team: {player.teams}</span>
              </button>;
            })}
          </div> : null}
          {selected ? <form onSubmit={(e) => { e.preventDefault(); void decide(selected.id, "approve", reason); }} className="space-y-3 border-t border-white/10 pt-4">
            <p className="text-sm text-emerald-100">Approve <strong>{selected.name}</strong> for <strong>{data.fixture.teamName}</strong> in this match only.</p>
            <label className="block text-sm text-white/75">Optional internal approval note
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} disabled={busy} className={`mt-2 ${inputStyle}`} />
            </label>
            <button className={buttonStyle} disabled={busy}>{busy ? "Saving…" : "Confirm guest approval"}</button>
          </form> : null}
        </div>
      ) : null}
      {data && data.approvals.length === 0 && !loading ? <p className="mt-4 text-sm text-white/65">No SIXFL guest approvals recorded for this team in this fixture.</p> : null}
      <div className="mt-4 space-y-3">
        {data?.approvals.map((approval) => <article key={approval.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-white">{approval.playerName}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${approval.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-100" : "bg-red-500/15 text-red-100"}`}>{approval.status === "APPROVED" ? "Guest — SIXFL approved" : "Revoked — not approved"}</span>
            </div>
            {editable && approval.status === "APPROVED" ? <button type="button" disabled={busy} onClick={() => { setRevoke(approval); setRevokeReason(""); }} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-50">Revoke approval</button> : null}
          </div>
          <p className="mt-2 text-xs text-white/60">Approved {dateTime(approval.approvedAt)} (UK){approval.approvedByName ? ` by ${approval.approvedByName}` : " by SIXFL"}.</p>
          {approval.reason ? <p className="mt-2 whitespace-pre-wrap text-sm text-white/65">Internal note: {approval.reason}</p> : null}
          {approval.revokedAt ? <p className="mt-2 text-xs text-red-100/80">Revoked {dateTime(approval.revokedAt)} (UK){approval.revokedByName ? ` by ${approval.revokedByName}` : ""}.{approval.revocationReason ? ` ${approval.revocationReason}` : ""}</p> : null}
          {revoke?.id === approval.id && editable ? <form onSubmit={(e) => { e.preventDefault(); void decide(approval.playerUserId, "revoke", revokeReason); }} className="mt-3 space-y-3">
            <label className="block text-sm text-white">Reason for revoking
              <input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} minLength={3} maxLength={500} required disabled={busy} className={`mt-2 ${inputStyle}`} />
            </label>
            <p className="text-xs text-white/65">This removes permission only. Check any existing matchday selection or fee separately.</p>
            <div className="flex gap-3"><button disabled={busy || revokeReason.trim().length < 3} className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm text-red-100 disabled:opacity-50">Confirm revocation</button><button type="button" disabled={busy} onClick={() => setRevoke(null)} className="px-3 py-2 text-sm text-white/70">Cancel</button></div>
          </form> : null}
        </article>)}
      </div>
    </section>
  );
}
