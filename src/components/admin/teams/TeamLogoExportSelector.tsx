"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TeamBadge from "@/components/admin/TeamBadge";
import { MAX_LOGO_EXPORT_TEAMS, type TeamLogoExportChoice } from "@/lib/team-logo-export-contract";

type Download = { url: string; name: string; exported: number; missing: number };
const control = "rounded-xl border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400";

export default function TeamLogoExportSelector({ teams }: { teams: TeamLogoExportChoice[] }) {
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [download, setDownload] = useState<Download | null>(null);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const leagues = useMemo(() => [...new Map(teams.map(team => [team.leagueKey, team.leagueName])).entries()].sort((a,b) => a[1].localeCompare(b[1])), [teams]);
  const visible = teams.filter(team => (!currentOnly || team.isCurrent) && (!league || team.leagueKey === league) &&
    (!selectedOnly || selected.has(team.id)) && team.name.toLowerCase().includes(search.trim().toLowerCase()));
  const selectable = visible.filter(team => Boolean(team.logoUrl?.trim()));
  const hiddenCount = [...selected].filter(id => !visible.some(team => team.id === id)).length;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!download) return;
    // The link belongs to this component; it also remains visible as a fallback.
    downloadRef.current?.click();
    return () => URL.revokeObjectURL(download.url);
  }, [download]);
  useEffect(() => { if (error || download) feedbackRef.current?.focus(); }, [error,download]);

  function toggle(id: string) {
    if (pending) return;
    setError("");
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_LOGO_EXPORT_TEAMS) next.add(id);
      return next;
    });
  }
  function selectShown() {
    const next = new Set([...selected, ...selectable.map(team => team.id)]);
    if (next.size > MAX_LOGO_EXPORT_TEAMS) { setError(`Choose up to ${MAX_LOGO_EXPORT_TEAMS} teams per ZIP.`); return; }
    setError(""); setSelected(next);
  }
  async function prepareDownload() {
    if (inFlight.current || !selected.size) return;
    inFlight.current = true; setPending(true); setError(""); setDownload(null);
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 80_000);
    try {
      const response = await fetch("/api/admin/teams/logo-export", {
        method: "POST", credentials: "same-origin", cache: "no-store", signal: abort.signal,
        headers: { "Content-Type": "application/json", "X-SIXFL-Logo-Export": "1" },
        body: JSON.stringify({ teamIds: [...selected] }),
      });
      if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("application/zip")) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error || "Download could not start. Check that you are signed in and try again.");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("The returned pack was empty. Please try again.");
      const name = /filename="([A-Za-z0-9._-]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] || "SIXFL-Team-Logos.zip";
      setDownload({ url: URL.createObjectURL(blob), name,
        exported: Number(response.headers.get("x-sixfl-logos-exported") ?? selected.size),
        missing: Number(response.headers.get("x-sixfl-logos-missing") ?? 0),
      });
    } catch (failure) {
      setError(abort.signal.aborted ? "The download took too long. Your selection is still here; try fewer teams or retry." : failure instanceof Error ? failure.message : "Download failed. Please try again.");
    } finally { clearTimeout(timer); inFlight.current = false; setPending(false); }
  }

  return <div className="space-y-5">
    <section className="sticky top-3 z-10 space-y-4 rounded-2xl border border-emerald-400/25 bg-[#07140f] p-5 shadow-lg" aria-label="Logo export controls">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-white/70">Search teams
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} className={control} placeholder="Team name" disabled={pending} />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-white/70">League
          <select value={league} onChange={e => setLeague(e.target.value)} className={control} disabled={pending}>
            <option value="">All leagues</option>{leagues.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
        <label className="flex items-center gap-2"><input type="checkbox" checked={currentOnly} onChange={e => setCurrentOnly(e.target.checked)} disabled={pending} />Current teams only</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} disabled={pending} />Show selected only</label>
        <button type="button" onClick={selectShown} disabled={pending || !selectable.length} className={control}>Select all shown</button>
        <button type="button" onClick={() => { setSelected(new Set()); setError(""); }} disabled={pending || !selected.size} className={control}>Clear selection</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-emerald-100"><strong>{selected.size} selected</strong> · {visible.length} shown{hiddenCount ? ` · ${hiddenCount} selected outside these filters` : ""}</p>
        <button type="button" onClick={prepareDownload} disabled={pending || !selected.size} aria-busy={pending}
          className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-bold text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Preparing ZIP…" : `Download selected logos (${selected.size})`}
        </button>
      </div>
      <p className="text-xs leading-5 text-white/55">Selection is retained when you change filters. Untick Current teams only to include older or unassigned records. Up to {MAX_LOGO_EXPORT_TEAMS} teams and 64 MB per pack.</p>
    </section>
    {(error || download) && <div ref={feedbackRef} tabIndex={-1} role={error ? "alert" : "status"}
      className={`rounded-2xl border p-4 text-sm ${error || download?.missing ? "border-amber-400/30 bg-amber-500/10 text-amber-100" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"}`}>
      {error ? <p>{error}</p> : download && <>
        <p><strong>{download.exported} logos prepared.</strong>{download.missing ? ` ${download.missing} selected logos could not be included. See SIXFL-export-report.txt inside the ZIP for the team names and reasons.` : " All selected logos are included."}</p>
        <a ref={downloadRef} href={download.url} download={download.name} className="mt-2 inline-flex font-semibold underline">Save ZIP file</a>
        <p className="mt-1 text-xs">Click Save ZIP file if your browser did not start the download.</p>
      </>}
    </div>}
    {visible.some(team => !team.logoUrl?.trim()) && <p className="text-sm text-amber-200">Teams without an assigned logo are labelled below and cannot be selected.</p>}
    {!visible.length ? <p className="rounded-2xl border border-white/10 p-6 text-white/60">No teams match these filters. Clear the search or untick Current teams only.</p> :
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map(team => {
          const missing = !team.logoUrl?.trim();
          return <label key={team.id} className={`flex min-w-0 items-start gap-3 rounded-2xl border p-4 ${selected.has(team.id) ? "border-emerald-400/60 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]"} ${missing ? "opacity-60" : "cursor-pointer hover:border-emerald-400/40"}`}>
            <input type="checkbox" aria-label={`Select ${team.name} (${team.season || team.leagueName})`} checked={selected.has(team.id)} onChange={() => toggle(team.id)} disabled={pending || missing || (!selected.has(team.id) && selected.size >= MAX_LOGO_EXPORT_TEAMS)} className="mt-3 h-4 w-4 shrink-0" />
            <TeamBadge name={team.name} logoUrl={team.logoUrl} />
            <span className="min-w-0 space-y-1"><span className="block break-words font-semibold text-white">{team.name}</span>
              <span className="block text-xs text-white/60">{team.leagueName}{team.season ? ` · ${team.season}` : ""}</span>
              <span className={`block text-xs ${missing ? "text-amber-200" : "text-white/45"}`}>{missing ? "No logo assigned" : team.isCurrent ? "Current team" : "Other team record"}</span>
            </span>
          </label>;
        })}
      </div>}
  </div>;
}
