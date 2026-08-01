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

function accountLabel(account: PlayerMergeAccountSummary) {
  return account.name || account.email || account.phone || account.userId;
}

function AccountSummaryCard({
  account,
  tone,
  title,
}: {
  account: PlayerMergeAccountSummary;
  tone: "keep" | "duplicate";
  title: string;
}) {
  const toneClasses =
    tone === "keep"
      ? "border-emerald-400/25 bg-emerald-500/[0.08]"
      : "border-amber-400/25 bg-amber-500/[0.08]";
  const titleClasses = tone === "keep" ? "text-emerald-100" : "text-amber-100";

  return (
    <section className={`rounded-3xl border p-5 ${toneClasses}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${titleClasses}`}>
        {title}
      </p>
      <h3 className="mt-2 text-xl font-semibold text-white">{accountLabel(account)}</h3>
      <div className="mt-3 space-y-1 text-sm text-white/65">
        <div>{account.email || "No email saved"}</div>
        <div>{account.phone || "No mobile saved"}</div>
        <div className="text-xs text-white/40">Account ID: {account.userId}</div>
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
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 text-sky-100">
            Login used
          </span>
        ) : null}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">
          Team registrations
        </div>
        <div className="divide-y divide-white/10">
          {account.teams.length === 0 ? (
            <div className="px-3 py-3 text-sm text-white/45">No active team membership.</div>
          ) : (
            account.teams.map((team) => {
              const context = [team.leagueName, team.leagueSeason].filter(Boolean).join(" · ");
              return (
                <div key={team.membershipId} className="px-3 py-3 text-sm text-white/70">
                  <div className="font-semibold text-white">{team.teamName}</div>
                  <div className="mt-0.5 text-xs text-white/45">
                    {team.role}{context ? ` · ${context}` : ""}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

function MergeForm({
  kept,
  duplicate,
  teamId,
}: {
  kept: PlayerMergeAccountSummary;
  duplicate: PlayerMergeAccountSummary;
  teamId: string | null;
}) {
  return (
    <form action={mergePlayerAccountsAction} className="rounded-3xl border border-red-400/20 bg-red-500/[0.05] p-5">
      <input type="hidden" name="keptUserId" value={kept.userId} />
      <input type="hidden" name="mergedUserId" value={duplicate.userId} />
      {teamId ? <input type="hidden" name="teamId" value={teamId} /> : null}

      <div className="font-semibold text-white">
        Keep {accountLabel(kept)} and merge {accountLabel(duplicate)} into it
      </div>
      <p className="mt-2 text-sm leading-6 text-white/60">
        Team memberships and player history move to the kept account. Where both records exist in the same team, availability, selection and profile data are consolidated. The discarded login is disabled and the merge is audited.
      </p>
      <p className="mt-2 text-sm leading-6 text-amber-100/80">
        The merge stops without changing anything if both records have active payment rows for the same fixture or conflicting admin fee overrides.
      </p>

      <label className="mt-4 block space-y-2 text-sm text-white/70">
        <span>Type MERGE to confirm</span>
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
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-red-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-red-300"
      >
        Merge duplicate into this account
      </button>
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
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Keep one player identity and consolidate the duplicate into it. A legitimate player registered for two teams should remain one account with two team memberships.
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

      {merged ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Player accounts merged successfully. The account shown below is the account that was kept.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
          {error}
        </div>
      ) : null}

      <AccountSummaryCard account={preview.selected} tone="keep" title="Selected account" />

      {preview.candidates.length === 0 ? (
        <section className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-6">
          <h2 className="text-xl font-semibold text-white">No likely duplicate found</h2>
          <p className="mt-2 text-sm leading-6 text-amber-50/75">
            The system could not find another account with the same name, email address or mobile number. Check the other squad record and open its Merge player button instead.
          </p>
        </section>
      ) : (
        <div className="space-y-8">
          {preview.candidates.map((candidate) => (
            <section key={candidate.userId} className="space-y-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5 lg:p-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Possible duplicate
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Compare these two accounts
                </h2>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <AccountSummaryCard account={preview.selected} tone="keep" title="Currently selected" />
                <AccountSummaryCard account={candidate} tone="duplicate" title="Possible duplicate" />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <MergeForm kept={preview.selected} duplicate={candidate} teamId={teamId} />
                <MergeForm kept={candidate} duplicate={preview.selected} teamId={teamId} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
