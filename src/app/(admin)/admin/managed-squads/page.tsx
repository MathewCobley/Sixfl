// ========================================
// File: src/app/(admin)/admin/managed-squads/page.tsx
// ========================================

import Link from "next/link";
import { requireAdmin } from "@/lib/requireAdmin";
import { getManagedSquadFlowDashboard } from "@/lib/managed-squads/invitations";
import { sendTuesdayManagedSquadInvitesAction } from "./actions";

type Props = {
  searchParams?: Promise<{
    sent?: string;
    queued?: string;
    skipped?: string;
    candidates?: string;
    error?: string;
  }>;
};

function formatLeagueName(team: {
  league: { name: string; season: string | null } | null;
}) {
  if (!team.league) return "No league assigned";
  return `${team.league.name}${team.league.season ? ` — ${team.league.season}` : ""}`;
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "green" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-red-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

export default async function AdminManagedSquadsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = (await searchParams) ?? {};
  const teams = await getManagedSquadFlowDashboard();

  const totals = teams.reduce(
    (acc, team) => ({
      candidates: acc.candidates + team.candidateCount,
      sent: acc.sent + team.invitesSent,
      interested: acc.interested + team.interested,
      notInterested: acc.notInterested + team.notInterested,
    }),
    { candidates: 0, sent: 0, interested: 0, notInterested: 0 },
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="text-sm text-emerald-300">Managed squads</div>
          <h1 className="text-3xl font-semibold text-white">
            Tuesday managed team flow
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-white/60">
            Send a one-click interest check to managed squad prospects and
            player leads. Yes responses move into the selected managed team
            prospects list as trial players; no responses are recorded.
          </p>
        </div>

        <Link
          href="/admin/teams"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Manage teams
        </Link>
      </div>

      {(sp.sent === "1" || sp.error) && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
          {sp.sent === "1" ? (
            <div className="text-emerald-300">
              Managed squad emails queued. Queued: {sp.queued ?? "0"}. Skipped
              recent duplicates: {sp.skipped ?? "0"}. Candidate pool:{" "}
              {sp.candidates ?? "0"}.
            </div>
          ) : null}

          {sp.error === "missing-team" ? (
            <div className="text-red-300">Choose a managed team first.</div>
          ) : null}

          {sp.error === "send-failed" ? (
            <div className="text-red-300">
              The managed squad emails could not be queued. Check email settings
              and try again.
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="candidate pool" value={totals.candidates} />
        <MetricCard label="invites sent" value={totals.sent} />
        <MetricCard label="interested" value={totals.interested} tone="green" />
        <MetricCard label="not interested" value={totals.notInterested} tone="red" />
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:p-8">
        <h2 className="text-xl font-semibold text-white">
          Tuesday availability check
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          The flow checks existing managed prospects plus player leads who have
          indicated Tuesday, any night, or no preferred night. Duplicate email
          addresses are removed and recent sends are skipped.
        </p>

        {teams.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            No managed teams found yet. Open a team and set Team mode to Managed
            before using this flow.
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            {teams.map((team) => (
              <div
                key={team.id}
                className="rounded-2xl border border-white/10 bg-black/25 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">
                        {team.name}
                      </h3>
                      {team.isRecruiting ? (
                        <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                          Recruiting
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-white/50">
                      {formatLeagueName(team)}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-white/45">
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                        {team._count.prospects} prospects on team
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                        {team.candidateCount} eligible email candidates
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                        {team.invitesSent} invites sent
                      </span>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                        {team.interested} yes
                      </span>
                      <span className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-red-200">
                        {team.notInterested} no
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/admin/teams/${team.id}/prospects`}
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
                    >
                      View prospects
                    </Link>
                    <form action={sendTuesdayManagedSquadInvitesAction}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-400"
                      >
                        Send Tuesday email
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
