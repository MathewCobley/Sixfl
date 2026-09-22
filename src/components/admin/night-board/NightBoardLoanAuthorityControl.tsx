"use client";

import { useEffect, useState, type FormEvent } from "react";
import { loanAuthorityLabel } from "@/lib/fixtures/loan-authority-policy";

type RequestRow = { teamId: string; count: number; revision: number };
type Team = { id: string; name: string };

function TeamRequest({ fixtureId, team, initial }: { fixtureId: string; team: Team; initial?: RequestRow }) {
  const [requested, setRequested] = useState(Boolean(initial?.count));
  const [count, setCount] = useState(String(initial?.count || 1));
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/night-board/loan-authority", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, teamId: team.id, count: requested ? Number(count) : 0, revision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the loan request.");
      setRevision(data.request.revision);
      setMessage(data.request.count ? `${loanAuthorityLabel(data.request.count)} — saved to both print sheets.` : "Request cleared from both print sheets.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the loan request."); }
    finally { setSaving(false); }
  }
  return <form onSubmit={save} className="rounded-xl border border-white/10 p-3">
    <div className="mb-2 text-xs font-semibold">{team.name}</div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={requested} disabled={saving} onChange={event => { setRequested(event.target.checked); setMessage(""); }} />
        Loan player authorisation requested
      </label>
      {requested && <label className="flex items-center gap-2 text-xs">Players
        <input type="number" min={1} max={9} step={1} required value={count} disabled={saving}
          onChange={event => { setCount(event.target.value); setMessage(""); }}
          className="w-16 rounded border border-white/20 bg-black/30 px-2 py-1 text-white" />
      </label>}
      <button type="submit" disabled={saving} className="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-50">{saving ? "Saving…" : "Save request"}</button>
    </div>
    {message && <p role="status" className="mt-2 text-xs text-emerald-200">{message}</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-200">{error}</p>}
  </form>;
}

export default function NightBoardLoanAuthorityControl({ fixtureId, teams }: { fixtureId: string; teams: Team[] }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setRows(null); setError("");
    fetch(`/api/admin/night-board/loan-authority?fixtureId=${encodeURIComponent(fixtureId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load requests."); return data.requests; })
      .then(data => { if (!controller.signal.aborted) setRows(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [fixtureId]);
  return <section aria-label="Loan player requests" className="mt-3 space-y-2">
    <p className="text-xs text-white/55">Record requests here. Individual guest approvals are managed separately.</p>
    {error ? <p role="alert" className="text-xs text-red-200">{error} Reload to try again.</p> : rows === null ? <p className="text-xs text-white/55">Loading loan requests…</p> : teams.map(team =>
      <TeamRequest key={`${fixtureId}:${team.id}`} fixtureId={fixtureId} team={team} initial={rows.find(row => row.teamId === team.id)} />)}
  </section>;
}
