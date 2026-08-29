import Link from "next/link";

import { getSharedEmailRepairPreview } from "@/lib/players/shared-email-repair";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

import { applySharedEmailRepairAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "User Identity Audit | SIXFL Admin",
};

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

function searchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function UserIdentityAuditPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const sp = (await searchParams) ?? {};
  const sharedEmail = searchValue(sp.sharedEmail).trim();
  const separateName = searchValue(sp.separateName).trim();
  const newEmail = searchValue(sp.newEmail).trim();
  const newPhone = searchValue(sp.newPhone).trim();
  const repairError = searchValue(sp.repairError).trim();
  const repairDone = searchValue(sp.repairDone) === "1";

  const repairPreview =
    sharedEmail || separateName || newEmail || newPhone
      ? await getSharedEmailRepairPreview({
          sharedEmail,
          separateName,
          newEmail,
          newPhone: newPhone || null,
        })
      : null;

  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdFromLeadId: true,
      teamMembers: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          team: { select: { id: true, name: true } },
        },
      },
      createdTeams: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  const missingEmailUsers = users.filter((user) => !user.email?.trim());
  const usersWithEmail = users.filter(
    (user): user is (typeof users)[number] & { email: string } =>
      Boolean(user.email?.trim()),
  );

  const byNormalisedEmail = new Map<string, typeof usersWithEmail>();
  for (const user of usersWithEmail) {
    const key = normaliseEmail(user.email);
    byNormalisedEmail.set(key, [...(byNormalisedEmail.get(key) ?? []), user]);
  }

  const duplicateEmailGroups = Array.from(byNormalisedEmail.entries())
    .filter(([, matches]) => matches.length > 1)
    .sort(([a], [b]) => a.localeCompare(b));
  const nonNormalisedUsers = usersWithEmail.filter(
    (user) => user.email !== normaliseEmail(user.email),
  );

  return (
    <main className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.06] p-6 lg:p-8">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200/70">
          User identity audit
        </p>
        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">One user, one email identity</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
              SIXFL uses the email address as the unique identity for a real user account. This screen shows records that must be repaired before we make email mandatory at database level.
            </p>
          </div>
          <Link
            href="/admin/users"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
          >
            Open all users
          </Link>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-400/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_34%),rgba(255,255,255,0.035)] p-6 lg:p-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-200/70">
              Shared email repair
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">Separate two people who once used the same email</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60">
              This keeps every fixture, payment, selection and team membership attached to its existing User or prospect ID. It only changes the person being separated to their unique contact details and re-synchronises player-related notification metadata from the real source records.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-emerald-100/80">
            No merge. No deletion. No football history is moved.
          </div>
        </div>

        {repairDone ? (
          <div className="mt-5 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <div className="font-bold">Shared email repair completed.</div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-emerald-50/75">
              <span>Users updated: {searchValue(sp.usersUpdated) || "0"}</span>
              <span>Leads updated: {searchValue(sp.leadsUpdated) || "0"}</span>
              <span>Prospects updated: {searchValue(sp.prospectsUpdated) || "0"}</span>
              <span>Player notification sources re-synced: {searchValue(sp.recipientsResynced) || "0"}</span>
              <span>Still unresolved: {searchValue(sp.unresolvedRecipients) || "0"}</span>
            </div>
          </div>
        ) : null}

        {repairError ? (
          <div className="mt-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
            {repairError}
          </div>
        ) : null}

        <form method="get" action="/admin/users/identity-audit" className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white/70">Shared / old email</span>
            <input
              name="sharedEmail"
              type="email"
              required
              defaultValue={sharedEmail}
              placeholder="old-shared@example.com"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white/70">Person to separate</span>
            <input
              name="separateName"
              required
              defaultValue={separateName}
              placeholder="Full player name"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white/70">Their new unique email</span>
            <input
              name="newEmail"
              type="email"
              required
              defaultValue={newEmail}
              placeholder="player-own-email@example.com"
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/50"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-white/70">Their mobile number <span className="font-normal text-white/35">(optional)</span></span>
            <input
              name="newPhone"
              defaultValue={newPhone}
              placeholder="07..."
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-amber-400/50"
            />
          </label>
          <div className="lg:col-span-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-500/15 px-5 py-2.5 text-sm font-bold text-amber-50 transition hover:bg-amber-500/25"
            >
              Preview shared-email repair
            </button>
          </div>
        </form>

        {repairPreview ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Current User on shared email</p>
                <p className="mt-2 font-semibold text-white">{repairPreview.sharedEmailUser?.name || "No User account"}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {repairPreview.sharedEmailUser?.teams || "No linked team membership found"}
                </p>
                {repairPreview.separateUserOnSharedEmail ? (
                  <span className="mt-3 inline-flex rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-100">
                    This is the person being separated
                  </span>
                ) : repairPreview.sharedEmailUser ? (
                  <span className="mt-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100">
                    Will remain untouched
                  </span>
                ) : null}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Exact-name records to move to new contact</p>
                <p className="mt-2 text-2xl font-black text-white">{repairPreview.leads.length + repairPreview.prospects.length + (repairPreview.separateUserOnSharedEmail ? 1 : 0)}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {repairPreview.leads.length} lead(s) · {repairPreview.prospects.length} prospect(s) · {repairPreview.separateUserOnSharedEmail ? "1 User" : "no User"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Shared-email notification metadata</p>
                <p className="mt-2 text-2xl font-black text-white">{repairPreview.recipients.total}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">
                  {repairPreview.recipients.playerSources} player-source · {repairPreview.recipients.leadSources} lead · {repairPreview.recipients.otherSources} other
                </p>
              </div>
            </div>

            {repairPreview.leads.length > 0 || repairPreview.prospects.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {repairPreview.leads.map((lead) => (
                  <div key={lead.id} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4 text-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">Lead to update</p>
                    <p className="mt-2 font-semibold text-white">{lead.contactName}</p>
                    <p className="mt-1 text-white/55">{lead.leagueName || "No league"} · {lead.email || "No email"} · {lead.phone || "No mobile"}</p>
                  </div>
                ))}
                {repairPreview.prospects.map((prospect) => (
                  <div key={prospect.id} className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.07] p-4 text-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100/60">Prospect to update</p>
                    <p className="mt-2 font-semibold text-white">{[prospect.firstName, prospect.lastName].filter(Boolean).join(" ")}</p>
                    <p className="mt-1 text-white/55">{prospect.teamName || "Unassigned"} · {prospect.status} · {prospect.email || "No email"}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {repairPreview.warnings.map((warning) => (
              <div key={warning} className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.07] px-4 py-3 text-sm leading-6 text-sky-50/75">
                {warning}
              </div>
            ))}

            {repairPreview.blockers.map((blocker) => (
              <div key={blocker} className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
                {blocker}
              </div>
            ))}

            {repairPreview.canApply ? (
              <form action={applySharedEmailRepairAction} className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.08] p-5">
                <input type="hidden" name="sharedEmail" value={repairPreview.input.sharedEmail} />
                <input type="hidden" name="separateName" value={repairPreview.input.separateName} />
                <input type="hidden" name="newEmail" value={repairPreview.input.newEmail} />
                <input type="hidden" name="newPhone" value={repairPreview.input.newPhone ?? ""} />
                <label className="flex items-start gap-3 text-sm leading-6 text-white/70">
                  <input name="confirmed" type="checkbox" required className="mt-1 h-4 w-4" />
                  <span>
                    I have checked the names above. Keep the existing football history on its current User/prospect IDs, move only <strong className="text-white">{repairPreview.input.separateName}</strong> to <strong className="text-white">{repairPreview.input.newEmail}</strong>, and re-sync shared-email player notifications from their real source records.
                  </span>
                </label>
                <button
                  type="submit"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-500/20 px-5 py-2.5 text-sm font-black text-amber-50 transition hover:bg-amber-500/30"
                >
                  Separate identities safely
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`rounded-2xl border p-5 ${missingEmailUsers.length > 0 ? "border-red-400/25 bg-red-500/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Missing email</p>
          <p className="mt-2 text-3xl font-black text-white">{missingEmailUsers.length}</p>
          <p className="mt-1 text-xs text-white/55">Must be resolved before email becomes required.</p>
        </div>
        <div className={`rounded-2xl border p-5 ${duplicateEmailGroups.length > 0 ? "border-amber-400/25 bg-amber-500/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Duplicate normalised email</p>
          <p className="mt-2 text-3xl font-black text-white">{duplicateEmailGroups.length}</p>
          <p className="mt-1 text-xs text-white/55">Catches case/spacing variants of the same address.</p>
        </div>
        <div className={`rounded-2xl border p-5 ${nonNormalisedUsers.length > 0 ? "border-amber-400/25 bg-amber-500/10" : "border-emerald-400/20 bg-emerald-500/10"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Needs normalising</p>
          <p className="mt-2 text-3xl font-black text-white">{nonNormalisedUsers.length}</p>
          <p className="mt-1 text-xs text-white/55">Uppercase or surrounding spaces should be cleaned.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Users without an email address</h2>
          <p className="mt-1 text-sm text-white/50">
            These are real User records, not prospects. Each one needs an email assigned or the record safely reconciled with an existing user.
          </p>
        </div>

        {missingEmailUsers.length === 0 ? (
          <div className="px-5 py-10 text-sm text-emerald-100/75">
            Good — every User record currently has an email address.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {missingEmailUsers.map((user) => (
              <div key={user.id} className="grid gap-4 px-5 py-5 xl:grid-cols-[1fr_auto] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{user.name?.trim() || "Unnamed user"}</span>
                    <span className="rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-100">NO EMAIL</span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60">{user.role}</span>
                  </div>
                  <div className="mt-2 text-xs text-white/40">User ID: {user.id}</div>
                  {user.createdFromLeadId ? (
                    <div className="mt-1 text-xs text-white/40">Created from lead: {user.createdFromLeadId}</div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.teamMembers.map((membership) => (
                      <Link
                        key={membership.id}
                        href={`/admin/teams/${membership.team.id}`}
                        className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/15"
                      >
                        {membership.team.name} · {membership.role}
                      </Link>
                    ))}
                    {user.createdTeams.map((team) => (
                      <Link
                        key={`created-${team.id}`}
                        href={`/admin/teams/${team.id}`}
                        className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-500/15"
                      >
                        Created team: {team.name}
                      </Link>
                    ))}
                    {user.teamMembers.length === 0 && user.createdTeams.length === 0 ? (
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">No linked team found</span>
                    ) : null}
                  </div>
                </div>
                <Link
                  href={`/admin/users?q=${encodeURIComponent(user.name?.trim() || "")}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
                >
                  Open user list
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-semibold text-white">Duplicate identity after email normalisation</h2>
          <p className="mt-1 text-sm text-white/50">
            These addresses become identical after trimming spaces and converting to lowercase, so they should represent one user identity.
          </p>
        </div>
        {duplicateEmailGroups.length === 0 ? (
          <div className="px-5 py-8 text-sm text-emerald-100/75">No case-insensitive duplicate user emails found.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {duplicateEmailGroups.map(([email, matches]) => (
              <div key={email} className="px-5 py-5">
                <div className="font-semibold text-amber-100">{email}</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {matches.map((user) => (
                    <div key={user.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                      <div className="font-semibold text-white">{user.name || "Unnamed user"}</div>
                      <div className="mt-1 text-white/55">Stored as: {user.email}</div>
                      <div className="mt-1 text-xs text-white/35">{user.role} · {user.teamMembers.map((membership) => membership.team.name).join(", ") || "No linked team"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {nonNormalisedUsers.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-xl font-semibold text-white">Emails needing normalisation</h2>
            <p className="mt-1 text-sm text-white/50">These should be stored in lowercase with no surrounding spaces.</p>
          </div>
          <div className="divide-y divide-white/10">
            {nonNormalisedUsers.map((user) => (
              <div key={user.id} className="px-5 py-4 text-sm">
                <span className="font-semibold text-white">{user.name || "Unnamed user"}</span>
                <span className="ml-3 text-white/50">{user.email}</span>
                <span className="mx-2 text-white/25">→</span>
                <span className="text-emerald-100">{normaliseEmail(user.email)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
