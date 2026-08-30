import Link from "next/link";

import { getUnresolvedSharedEmailPlayerRecipients } from "@/lib/players/shared-email-unresolved";
import { requireAdmin } from "@/lib/requireAdmin";

import { quarantineUnresolvedSharedEmailAction } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Unresolved Shared Email Metadata | SIXFL Admin",
};

function searchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function UnresolvedSharedEmailPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const sharedEmail = searchValue(sp.sharedEmail).trim();
  const separateName = searchValue(sp.separateName).trim();
  const cleanupDone = searchValue(sp.cleanupDone) === "1";
  const cleanupError = searchValue(sp.cleanupError).trim();
  const quarantined = searchValue(sp.quarantined).trim();

  const unresolved =
    sharedEmail && separateName
      ? await getUnresolvedSharedEmailPlayerRecipients({ sharedEmail, separateName })
      : [];

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-3xl border border-amber-400/25 bg-amber-500/[0.07] p-6 lg:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-200/70">
          Identity audit · stale metadata
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">Unresolved shared-email notification metadata</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              This screen only finds player-related NotificationRecipient rows whose original player source no longer exists. It never edits Users, teams, fixtures, selections, payments, match fees or football history.
            </p>
          </div>
          <Link
            href="/admin/users/identity-audit"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10"
          >
            Back to Identity Audit
          </Link>
        </div>
      </section>

      {cleanupDone ? (
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          Cleanup completed. Quarantined stale notification records: {quarantined || "0"}.
        </div>
      ) : null}

      {cleanupError ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {cleanupError}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
        <form method="get" className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white/70">Shared / old email</span>
            <input
              type="email"
              name="sharedEmail"
              required
              defaultValue={sharedEmail}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-amber-400/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white/70">Person name shown on stale record</span>
            <input
              name="separateName"
              required
              defaultValue={separateName}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none focus:border-amber-400/50"
            />
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-500/15 px-5 py-2.5 text-sm font-bold text-amber-50 hover:bg-amber-500/25"
            >
              Trace unresolved record
            </button>
          </div>
        </form>
      </section>

      {sharedEmail && separateName ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Verified stale records</p>
              <h2 className="mt-2 text-2xl font-black text-white">{unresolved.length}</h2>
            </div>
            <div className="text-xs text-white/45">
              Only rows with a missing underlying player source appear here.
            </div>
          </div>

          {unresolved.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              No unresolved player-source metadata remains for this name and shared email.
            </div>
          ) : (
            <>
              <div className="mt-5 space-y-3">
                {unresolved.map((row) => (
                  <div key={row.id} className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">
                        {row.sourceKind}
                      </span>
                      <span className="text-sm font-semibold text-white">{row.displayName || "Unnamed historic recipient"}</span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-white/55">
                      <div><span className="text-white/35">Source ID:</span> {row.sourceId || "None"}</div>
                      <div><span className="text-white/35">Recipient ID:</span> {row.id}</div>
                      <div><span className="text-white/35">Stored email:</span> {row.email || "None"}</div>
                      <div><span className="text-white/35">Stored phone:</span> {row.phone || "None"}</div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-amber-50/65">
                      The referenced player source cannot be found. Because there is no live source to establish ownership, this row must not be reassigned to either player.
                    </p>
                  </div>
                ))}
              </div>

              <form action={quarantineUnresolvedSharedEmailAction} className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/[0.06] p-5">
                <input type="hidden" name="sharedEmail" value={sharedEmail} />
                <input type="hidden" name="separateName" value={separateName} />
                <label className="flex items-start gap-3 text-sm leading-6 text-white/70">
                  <input type="checkbox" name="quarantineConfirmed" required className="mt-1 h-4 w-4" />
                  <span>
                    I have checked the stale source IDs above. Remove the old shared email/phone only from these dead notification records and preserve the original values in quarantine audit metadata. Do not alter any football record.
                  </span>
                </label>
                <button
                  type="submit"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/15 px-5 py-2.5 text-sm font-black text-red-50 hover:bg-red-500/25"
                >
                  Quarantine stale metadata
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}
