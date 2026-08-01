import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPlayerMergePreview,
  type PlayerMergeAccountSummary,
} from "@/lib/players/player-account-merge";
import { requireAdmin } from "@/lib/requireAdmin";
import { mergePlayerAccountsAction } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Merge Player Accounts | SIXFL",
};

type SearchParams = {
  teamId?: string;
  error?: string;
  merged?: string;
};

function accountName(account: PlayerMergeAccountSummary) {
  return account.name || "Unnamed player";
}

function accountIdentity(account: PlayerMergeAccountSummary) {
  if (account.email) return account.email;
  if (account.phone) return account.phone;
  return `Account ending ${account.userId.slice(-6)}`;
}

function accountCode(account: PlayerMergeAccountSummary) {
  return account.userId.slice(-6).toUpperCase();
}

function teamLabel(team: PlayerMergeAccountSummary["teams"][number]) {
  const context = [team.leagueName, team.leagueSeason].filter(Boolean).join(" · ");
  return `${team.teamName}${context ? ` — ${context}` : ""}`;
}

function combinedTeams(
  kept: PlayerMergeAccountSummary,
  duplicate: PlayerMergeAccountSummary,
) {
  const byTeamId = new Map<string, PlayerMergeAccountSummary["teams"][number]>();
  for (const team of [...kept.teams, ...duplicate.teams]) {
    if (!byTeamId.has(team.teamId)) byTeamId.set(team.teamId, team);
  }
  return Array.from(byTeamId.values()).sort((a, b) =>
    a.teamName.localeCompare(b.teamName),
  );
}

function AccountSummaryCard({
  account,
  label,
  tone,
}: {
  account: PlayerMergeAccountSummary;
  label: string;
  tone: "a" | "b";
}) {
  const toneClasses =
    tone === "a"
      ? "border-sky-400/25 bg-sky-500/[0.08]"
      : "border-amber-400/25 bg-amber-500/[0.08]";
  const labelClasses = tone === "a" ? "text-sky-100" : "text-amber-100";

  return (
    <section className={`rounded-3xl border p-5 ${toneClasses}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${labelClasses}`}>
          {label}
        </p>
        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 font-mono text-[11px] text-white/55">
          ID {accountCode(account)}
        </span>
      </div>

      <h3 className="mt-3 text-xl font-semibold text-white">{accountName(account)}</h3>
      <div className="mt-2 space-y-1 text-sm text-white/65">
        <div className="font-medium text-white/80">{accountIdentity(account)}</div>
        <div>{account.email || "No email saved"}</div>
        <div>{account.phone || "No mobile saved"}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/70">
          {account.teams.length} team{account.teams.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/70">
          {account.playerPaymentCount} payment row{account.playerPaymentCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-white/70">
          {account.availabilityCount} availability row{account.availabilityCount === 1 ? "" : "s"}
        </span>
        {account.loginAccountCount > 0 || account.activeSessionCount > 0 ? (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-emerald-100">
            Login used
          </span>
        ) : (
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-white/50">
            No login recorded
          </span>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">
          Cards currently attached to this account
        </div>
        <div className="divide-y divide-white/10">
          {account.teams.length === 0 ? (
            <div className="px-3 py-3 text-sm text-white/45">No active team cards.</div>
          ) : (
            account.teams.map((team) => (
              <div key={team.membershipId} className="px-3 py-3 text-sm text-white/70">
                <div className="font-semibold text-white">{team.teamName}</div>
                <div className="mt-0.5 text-xs text-white/45">
                  {team.role}
                  {[team.leagueName, team.leagueSeason].filter(Boolean).length
                    ? ` · ${[team.leagueName, team.leagueSeason].filter(Boolean).join(" · ")}`
                    : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function MergeChoice({
  kept,
  duplicate,
  keptLabel,
  duplicateLabel,
  teamId,
}: {
  kept: PlayerMergeAccountSummary;
  duplicate: PlayerMergeAccountSummary;
  keptLabel: string;
  duplicateLabel: string;
  teamId: string | null;
}) {
  const resultTeams = combinedTeams(kept, duplicate);

  return (
    <form
      action={mergePlayerAccountsAction}
      className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
    >
      <input type="hidden" name="keptUserId" value={kept.userId} />
      <input type="hidden" name="mergedUserId" value={duplicate.userId} />
      {teamId ? <input type="hidden" name="teamId" value={teamId} /> : null}

      <div className="border-b border-white/10 bg-black/20 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Choose this option
        </p>
        <h3 className="mt-2 text-xl font-semibold text-white">
          Keep {keptLabel} and remove {duplicateLabel}
        </h3>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
            Account that stays active
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {keptLabel}: {accountName(kept)}
          </div>
          <div className="mt-1 text-sm text-emerald-50/75">
            {accountIdentity(kept)} · ID {accountCode(kept)}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/70">
            Duplicate account that will be disabled
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {duplicateLabel}: {accountName(duplicate)}
          </div>
          <div className="mt-1 text-sm text-amber-50/75">
            {accountIdentity(duplicate)} · ID {accountCode(duplicate)}
          </div>
          <div className="mt-2 text-sm text-amber-50/70">
            Its {duplicate.teams.length} squad card{duplicate.teams.length === 1 ? "" : "s"}, profile details,
            availability, selections and compatible payment history move into the account above.
          </div>
        </div>

        <div className="rounded-2xl border border-sky-400/25 bg-sky-500/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/70">
            Result after the merge
          </div>
          <div className="mt-2 font-semibold text-white">
            One player account remains: {keptLabel}.
          </div>
          <div className="mt-2 text-sm leading-6 text-sky-50/75">
            It will be registered for {resultTeams.length} team{resultTeams.length === 1 ? "" : "s"}:
          </div>
          <div className="mt-2 space-y-1 text-sm text-white/80">
            {resultTeams.map((team) => (
              <div key={team.teamId}>• {teamLabel(team)}</div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-4 text-sm leading-6 text-red-50/75">
          Nothing changes if the system finds conflicting active payment rows for the same fixture or different admin fee overrides.
        </div>

        <label className="block space-y-2 text-sm text-white/70">
          <span>
            Type <strong className="text-white">MERGE</strong> to confirm that {keptLabel} stays and {duplicateLabel} is disabled
          </span>
          <input
            name="confirmation"
            required
            autoComplete="off"
            placeholder="MERGE"
            className="w-full rounded-xl border border-red-400/20 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-red-300/60"
          />
        </label>

        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-red-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-red-300"
        >
          Keep {keptLabel} — merge and disable {duplicateLabel}
        </button>
      </div>
    </form>
  );
}

export default async function MergePlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const filters = await searchParams;
  const preview = await getPlayerMergePreview(userId);

  if (!preview) notFound();

  const teamId = filters.teamId?.trim() || null;
  const error = filters.error ? decodeURIComponent(filters.error) : null;
  const merged = filters.merged === "1";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/75">
            Admin player tools
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Merge duplicate player accounts</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            Compare Account A and Account B, then choose which one should remain active. The other account is disabled and all of its squad cards and player history move into the account you keep.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {teamId ? (
            <Link
              href={`/admin/teams/${teamId}/squad`}
              className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              Back to squad
            </Link>
          ) : null}
          <Link
            href="/admin/teams"
            className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
          >
            All teams
          </Link>
        </div>
      </div>

      <section className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-semibold text-white">1. Compare</div>
          <div className="mt-1 text-xs leading-5 text-white/50">Check the email, mobile, ID, login use and team cards on each account.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-semibold text-white">2. Choose the account to keep</div>
          <div className="mt-1 text-xs leading-5 text-white/50">Use the login/contact details that should remain active.</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-xs font-semibold text-white">3. Confirm</div>
          <div className="mt-1 text-xs leading-5 text-white/50">Type MERGE only in the option that names the correct surviving account.</div>
        </div>
      </section>

      {merged ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Merge completed. The account displayed as Account A below is the account that remains active.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
          {error}
        </div>
      ) : null}

      {preview.candidates.length === 0 ? (
        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
          <h2 className="text-xl font-semibold text-white">No likely duplicate found</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/75">
            The system could not find another account with the same name, email address or mobile number. Open the other squad card and use its Merge player button instead.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {preview.candidates.map((candidate) => (
            <section key={candidate.userId} className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5 lg:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Possible duplicate pair
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Which account should remain active?
                </h2>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <AccountSummaryCard account={preview.selected} label="Account A" tone="a" />
                <AccountSummaryCard account={candidate} label="Account B" tone="b" />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <MergeChoice
                  kept={preview.selected}
                  duplicate={candidate}
                  keptLabel="Account A"
                  duplicateLabel="Account B"
                  teamId={teamId}
                />
                <MergeChoice
                  kept={candidate}
                  duplicate={preview.selected}
                  keptLabel="Account B"
                  duplicateLabel="Account A"
                  teamId={teamId}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
