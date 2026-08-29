"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type LookupMatch = {
  source: string;
  title: string;
  detail: string;
  effect: string;
  href: string | null;
  recordId: string | null;
  tone: "default" | "amber" | "emerald" | "sky";
};

type LookupResponse = {
  ok: boolean;
  query?: string;
  queryType?: "email" | "phone" | "name";
  normalisedQuery?: string;
  matchCount?: number;
  matches?: LookupMatch[];
  error?: string;
};

function toneClasses(tone: LookupMatch["tone"]) {
  if (tone === "amber") return "border-amber-400/25 bg-amber-500/[0.08]";
  if (tone === "emerald") return "border-emerald-400/25 bg-emerald-500/[0.08]";
  if (tone === "sky") return "border-sky-400/25 bg-sky-500/[0.08]";
  return "border-white/10 bg-white/[0.04]";
}

function queryTypeLabel(type: LookupResponse["queryType"]) {
  if (type === "email") return "Email match";
  if (type === "phone") return "Mobile-number match";
  if (type === "name") return "Exact-name match";
  return "Identity match";
}

export default function EmailRecordLookup() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResponse | null>(null);

  const matches = useMemo(() => result?.matches ?? [], [result]);

  if (pathname !== "/admin/email-audit") return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;

    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/email-lookup?q=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as LookupResponse;
      setResult(payload);
    } catch (error) {
      console.error("Identity record lookup failed", error);
      setResult({ ok: false, error: "Could not complete the lookup. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto mb-7 max-w-[1450px] overflow-hidden rounded-3xl border border-amber-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_32%),rgba(255,255,255,0.035)] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/75">
            Find the actual person record
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Identity lookup</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Search by email address, mobile number or full player name. This checks squad memberships, Users, prospects, PlayerPool, leads, team contacts and recent blocked player-creation attempts.
          </p>
        </div>

        <form onSubmit={submit} className="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email, mobile number or full player name"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-amber-400/50"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-500/15 px-5 text-sm font-bold text-amber-50 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Searching…" : "Find identity"}
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-white/45 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <span className="font-semibold text-white/70">Email:</span> exact, case-insensitive match
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <span className="font-semibold text-white/70">Mobile:</span> normalised UK number match
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <span className="font-semibold text-white/70">Name:</span> exact full-name match; verify contact details
        </div>
      </div>

      {result?.ok === false ? (
        <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {result.error || "No result was returned."}
        </div>
      ) : null}

      {result?.ok ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">{result.query}</p>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">
                  {queryTypeLabel(result.queryType)}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/45">
                {result.matchCount === 1 ? "1 matching record" : `${result.matchCount ?? 0} matching records`}
              </p>
            </div>
            <p className="max-w-2xl text-xs leading-5 text-white/40 sm:text-right">
              Lead and notification records are shown for completeness. They do not by themselves block player creation. Name matches are clues only until the contact details agree.
            </p>
          </div>

          {matches.length ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {matches.map((match, index) => (
                <article
                  key={`${match.source}-${match.recordId ?? index}-${index}`}
                  className={`rounded-2xl border p-4 ${toneClasses(match.tone)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-white/40">
                        {match.source}
                      </p>
                      <h3 className="mt-2 break-words text-base font-semibold text-white">
                        {match.title}
                      </h3>
                      <p className="mt-1 break-words text-sm leading-6 text-white/60">{match.detail}</p>
                    </div>

                    {match.href ? (
                      <Link
                        href={match.href}
                        className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
                      >
                        Open
                      </Link>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/55">
                    {match.effect}
                  </div>

                  {match.recordId ? (
                    <p className="mt-2 break-all text-[10px] text-white/25">Record: {match.recordId}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/50">
              No current SIXFL record was found for this exact identity search.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
