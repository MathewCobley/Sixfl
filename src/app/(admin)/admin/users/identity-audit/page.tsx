import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "User Identity Audit | SIXFL Admin",
};

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

export default async function UserIdentityAuditPage() {
  await requireAdmin();

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
